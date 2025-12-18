import React, { useRef, useState, useEffect, useMemo } from 'react';
import { AnalysisResult, LiveDetection } from '../types';

interface PaperCanvasProps {
  imageSrc: string;
  data: AnalysisResult | null;
  liveDetections?: LiveDetection[];
  detailLevel: number;
  isVideo?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: () => void;
  onExportPDF?: () => void;
}

// ---------------------------------------------------------------------------
// Logic & Constants
// ---------------------------------------------------------------------------

interface LayoutLabel {
  id: string;
  textLines: string[];
  isHeader: boolean;
  objColor: string;
  textColor: string; 
  px: number; // origin x (object point)
  py: number; // origin y (object point)
  tx: number; // target x (text position center)
  ty: number; // target y (text position center)
  width: number;
  height: number;
  edge: 'left' | 'right' | 'top' | 'bottom';
}

// Increased Margin X to accommodate labels strictly outside
const MARGIN_X = 800; 
const MARGIN_Y = 600; 
const FONT_HEIGHT_HEADER = 20;
const FONT_HEIGHT_DETAIL = 14;
const LABEL_PADDING = 10; 

// PROFESSIONAL PALETTE
const PALETTE = [
  "#1e40af", // Blue 800
  "#991b1b", // Red 800
  "#166534", // Green 800
  "#854d0e", // Yellow 800
  "#6b21a8", // Purple 800
  "#0f766e", // Teal 700
  "#c2410c", // Orange 700
];

const getContrastColor = (hexcolor: string) => '#ffffff';

const parseTimestamp = (ts?: string): number => {
    if (!ts) return -1;
    try {
        const parts = ts.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
    } catch(e) { return -1; }
    return -1;
};

// --- Layout Solver (Pure Function) ---
const solve1DLayout = (items: LayoutLabel[], isVertical: boolean, minPos: number, maxPos: number) => {
  if (items.length === 0) return;
  
  items.sort((a, b) => isVertical ? (a.py - b.py) : (a.px - b.px));
  
  let iterations = 20;
  while (iterations-- > 0) {
    let overlapFound = false;
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      
      const aPos = isVertical ? a.ty : a.tx;
      const bPos = isVertical ? b.ty : b.tx;
      const aSize = isVertical ? a.height : a.width;
      const bSize = isVertical ? b.height : b.width;
      
      const dist = bPos - aPos;
      const minSep = (aSize + bSize) / 2 + 10; 
      
      if (dist < minSep) {
        overlapFound = true;
        const push = (minSep - dist) / 2;
        if (isVertical) {
          a.ty -= push;
          b.ty += push;
        } else {
          a.tx -= push;
          b.tx += push;
        }
      }
    }
    
    // Boundary constraints
    for (let item of items) {
       if (isVertical) {
         if (item.ty - item.height/2 < minPos) item.ty = minPos + item.height/2;
         if (item.ty + item.height/2 > maxPos) item.ty = maxPos - item.height/2;
       } else {
         if (item.tx - item.width/2 < minPos) item.tx = minPos + item.width/2;
         if (item.tx + item.width/2 > maxPos) item.tx = maxPos - item.width/2;
       }
    }
    if (!overlapFound) break;
  }
};


const PaperCanvas: React.FC<PaperCanvasProps> = ({ 
    imageSrc, 
    data, 
    liveDetections = [],
    detailLevel, 
    isVideo = false, 
    videoRef, 
    onTimeUpdate,
    onExportPDF
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for Native Dimensions (Aspect Ratio)
  const [imgDims, setImgDims] = useState({ w: 1000, h: 1000 });
  
  // Pan/Zoom State
  const [scale, setScale] = useState(0.45); 
  const [offset, setOffset] = useState({ x: 0, y: 0 }); 
  
  // Mouse Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Touch State
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(scale);

  const [currentTime, setCurrentTime] = useState(0);

  // Load Image Dims for Static Images
  useEffect(() => {
    if (!isVideo && imageSrc) {
        const img = new Image();
        img.onload = () => {
            setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
            // Center view initially
            setOffset({ x: 0, y: 0 });
            // Adjust default scale based on screen size for mobile
            if (window.innerWidth < 768) {
                setScale(0.3); // Start zoomed out on mobile
            }
        };
        img.src = imageSrc;
    }
  }, [imageSrc, isVideo]);

  // Sync with video element
  useEffect(() => {
    if (isVideo && videoRef?.current) {
        const vid = videoRef.current;
        const handler = () => {
            setCurrentTime(vid.currentTime);
            if(onTimeUpdate) onTimeUpdate();
        };
        // Update dims when video metadata loads
        const metaHandler = () => {
             setImgDims({ w: vid.videoWidth, h: vid.videoHeight });
             setOffset({ x: 0, y: 0 });
             if (window.innerWidth < 768) {
                setScale(0.3);
            }
        };

        vid.addEventListener('timeupdate', handler);
        vid.addEventListener('loadedmetadata', metaHandler);
        
        return () => {
            vid.removeEventListener('timeupdate', handler);
            vid.removeEventListener('loadedmetadata', metaHandler);
        };
    }
  }, [isVideo, videoRef, onTimeUpdate]);

  // Filter objects
  const visibleObjects = useMemo(() => {
    if (!data) return [];
    
    let filtered = data.objects;
    if (isVideo) {
        filtered = filtered.filter(obj => {
           if (!obj.timestamp) return true; 
           const objTime = parseTimestamp(obj.timestamp);
           if (objTime === -1) return true; 
           // Reduced visibility window to 0.6s for snappier transitions
           return Math.abs(currentTime - objTime) < 0.6; 
        });
    }

    if (detailLevel < 100) {
       const maxDetails = Math.max(1, Math.floor(detailLevel / 20));
       filtered = filtered.map(obj => ({
           ...obj,
           details: obj.details.slice(0, maxDetails)
       }));
       if (detailLevel < 30) {
           filtered = filtered.slice(0, Math.max(1, Math.floor(filtered.length * (detailLevel/30))));
       }
    }
    
    return filtered;
  }, [data, detailLevel, isVideo, currentTime]);

  // --- Layout Computation with Coordinate Scaling ---
  const layout = useMemo(() => {
    if (!data) return [];

    const labels: LayoutLabel[] = [];
    // Scaling factors (Gemini returns 0-1000, we map to imgDims)
    const scaleX = imgDims.w / 1000;
    const scaleY = imgDims.h / 1000;
    
    visibleObjects.forEach((obj, idx) => {
      const color = PALETTE[idx % PALETTE.length];
      const textColor = getContrastColor(color);

      // Scale box to native image dimensions
      const ymin = obj.box_2d[0] * scaleY;
      const xmin = obj.box_2d[1] * scaleX;
      const ymax = obj.box_2d[2] * scaleY;
      const xmax = obj.box_2d[3] * scaleX;
      
      const cx = (xmin + xmax) / 2;
      const cy = (ymin + ymax) / 2;
      
      // Determine quadrant relative to image center
      const quadrant = (cy > imgDims.h/2 ? 2 : 0) + (cx > imgDims.w/2 ? 1 : 0);
      
      let edge: 'left' | 'right';
      let px: number, py: number;
      let tx: number, ty: number;

      // STRATEGY: STRICTLY OUTSIDE
      // We push the labels far out into the MARGIN area.
      // Left side: -350px from left edge (0)
      // Right side: +350px from right edge (imgDims.w)

      if (quadrant === 0 || quadrant === 2) { // Left Side
         edge = 'left';
         px = xmin; py = cy;
         tx = -350; // Force outside left
         ty = py; 
      } else { // Right Side
         edge = 'right';
         px = xmax; py = cy;
         tx = imgDims.w + 350; // Force outside right
         ty = py;
      }

      const headerTextLines = [
          obj.name.toUpperCase(),
          obj.biometrics?.is_face ? `AGE: ${obj.biometrics.estimated_age || '?'} | ${obj.biometrics.gender_presentation || '?'}` :
          obj.tracking?.estimated_speed ? `SPEED: ${obj.tracking.estimated_speed}` :
          obj.material
      ].filter(Boolean);

      const headerWidth = 260; // Reduced width for smaller font
      const headerHeight = (headerTextLines.length * FONT_HEIGHT_HEADER) + LABEL_PADDING * 2;

      labels.push({
        id: `head_${obj.id}`,
        textLines: headerTextLines,
        isHeader: true,
        objColor: color,
        textColor: textColor,
        px, py,
        tx, ty,
        width: headerWidth,
        height: headerHeight,
        edge
      });

      obj.details.forEach((det, dIdx) => {
         // Scale detail points too
         const dpx = det.location_point[1] * scaleX; 
         const dpy = det.location_point[0] * scaleY; 
         
         const detailTextLines = [det.name.toUpperCase(), det.description];
         const estHeight = 45; // Reduced height for smaller font

         labels.push({
             id: `det_${obj.id}_${dIdx}`,
             textLines: detailTextLines,
             isHeader: false,
             objColor: color,
             textColor: '#334155',
             px: dpx, py: dpy,
             tx: tx + (edge === 'left' ? -50 : 50),
             ty: ty + (dIdx + 1) * 80,
             width: 240, // Reduced width
             height: estHeight,
             edge
         });
      });
    });

    const leftItems = labels.filter(l => l.edge === 'left');
    const rightItems = labels.filter(l => l.edge === 'right');
    
    // Solve layout within the MARGIN zones
    // Left Zone: -MARGIN_Y to Height+Margin
    solve1DLayout(leftItems, true, -MARGIN_Y + 100, imgDims.h + MARGIN_Y - 100);
    solve1DLayout(rightItems, true, -MARGIN_Y + 100, imgDims.h + MARGIN_Y - 100);

    return labels;
  }, [visibleObjects, data, imgDims]);


  // --- Render Loop ---
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
             canvas.width = rect.width * dpr;
             canvas.height = rect.height * dpr;
             ctx.scale(dpr, dpr);
        } else {
             ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
        }

        ctx.fillStyle = "#ffffff"; 
        ctx.fillRect(0, 0, rect.width, rect.height);

        // --- Transform Viewport ---
        ctx.save();
        ctx.translate(rect.width / 2, rect.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(offset.x, offset.y);
        
        // Center the content
        ctx.translate(-imgDims.w / 2, -imgDims.h / 2);
        
        // 1. Draw Image or Video
        if (isVideo && videoRef?.current) {
            const vid = videoRef.current;
            if (vid.readyState >= 2) {
                 ctx.drawImage(vid, 0, 0, imgDims.w, imgDims.h);
            } else {
                 ctx.fillStyle = "#000";
                 ctx.fillRect(0,0, imgDims.w, imgDims.h);
                 ctx.fillStyle = "#fff";
                 ctx.fillText("VIDEO LOADING...", imgDims.w/2 - 50, imgDims.h/2);
            }
        } else {
            const img = new Image();
            img.src = imageSrc;
            if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, 0, 0, imgDims.w, imgDims.h);
            }
        }

        // 2. Draw Grid (Adaptive to image size)
        ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=imgDims.w; i+=50) { ctx.moveTo(i, 0); ctx.lineTo(i, imgDims.h); }
        for(let i=0; i<=imgDims.h; i+=50) { ctx.moveTo(0, i); ctx.lineTo(imgDims.w, i); }
        ctx.stroke();

        const scaleX = imgDims.w / 1000;
        const scaleY = imgDims.h / 1000;

        // 3a. LIVE DETECTIONS
        if (liveDetections && liveDetections.length > 0) {
            liveDetections.forEach((det, idx) => {
                // SYNCHRONIZATION CHECK
                // If we are playing a video file, check if this detection is too old
                if (isVideo && det.timestamp !== undefined) {
                     const timeDiff = Math.abs(currentTime - det.timestamp);
                     // If difference is greater than 1.2s, it's a "ghost" box from the past. Hide it.
                     if (timeDiff > 1.2) return; 
                }

                const ymin = det.box_2d[0] * scaleY;
                const xmin = det.box_2d[1] * scaleX;
                const ymax = det.box_2d[2] * scaleY;
                const xmax = det.box_2d[3] * scaleX;
                
                const color = "#22c55e"; 
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 4 / scale; 
                ctx.strokeRect(xmin, ymin, xmax - xmin, ymax - ymin);
                
                ctx.fillStyle = color;
                ctx.fillRect(xmin, ymin - (25/scale), Math.min(200, xmax-xmin), (25/scale));
                ctx.fillStyle = "#ffffff";
                ctx.font = `bold ${Math.max(9, 11 / scale)}px 'Inter', sans-serif`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(det.label.toUpperCase(), xmin + 5, ymin - (12/scale));
            });
        }

        // 3b. STATIC ANALYSIS OBJECTS
        if (data && (!liveDetections || liveDetections.length === 0)) {
            visibleObjects.forEach((obj, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                const ymin = obj.box_2d[0] * scaleY;
                const xmin = obj.box_2d[1] * scaleX;
                const ymax = obj.box_2d[2] * scaleY;
                const xmax = obj.box_2d[3] * scaleX;
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 3 / scale;
                ctx.strokeRect(xmin, ymin, xmax - xmin, ymax - ymin);
                
                // Corner accents
                ctx.lineWidth = 6 / scale;
                const len = 40 / scale;
                ctx.beginPath();
                ctx.moveTo(xmin, ymin + len); ctx.lineTo(xmin, ymin); ctx.lineTo(xmin + len, ymin);
                ctx.moveTo(xmax - len, ymin); ctx.lineTo(xmax, ymin); ctx.lineTo(xmax, ymin + len);
                ctx.moveTo(xmin, ymax - len); ctx.lineTo(xmin, ymax); ctx.lineTo(xmin + len, ymax);
                ctx.moveTo(xmax - len, ymax); ctx.lineTo(xmax, ymax); ctx.lineTo(xmax, ymax - len);
                ctx.stroke();

                // Tracking Trajectory
                if (obj.tracking?.trajectory && obj.tracking.trajectory.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2 / scale;
                    ctx.setLineDash([5 / scale, 5 / scale]);
                    const traj = obj.tracking.trajectory;
                    ctx.moveTo(traj[0][1] * scaleX, traj[0][0] * scaleY); 
                    for(let i=1; i<traj.length; i++) {
                        ctx.lineTo(traj[i][1] * scaleX, traj[i][0] * scaleY);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // 4. Draw Labels
            layout.forEach(lbl => {
                ctx.beginPath();
                ctx.strokeStyle = lbl.objColor; 
                ctx.lineWidth = 1 / scale;
                
                // Clean Connector Logic
                // We create a vertical "channel" just outside the image
                // Left channel: -50px, Right channel: Width + 50px
                const elbowX = lbl.edge === 'left' ? -50 : imgDims.w + 50;
                
                ctx.moveTo(lbl.px, lbl.py); // Object point
                ctx.lineTo(elbowX, lbl.py); // Horizontal to channel
                ctx.lineTo(elbowX, lbl.ty); // Vertical in channel
                ctx.lineTo(lbl.tx, lbl.ty); // Horizontal to label
                ctx.stroke();

                // Object Dot
                ctx.fillStyle = lbl.objColor;
                ctx.beginPath();
                ctx.arc(lbl.px, lbl.py, 4 / scale, 0, Math.PI * 2);
                ctx.fill();
                
                // Connector/Label Junction Dot (Optional, adds tech feel)
                ctx.beginPath();
                ctx.arc(elbowX, lbl.py, 2 / scale, 0, Math.PI * 2);
                ctx.fill();

                const boxX = lbl.tx - lbl.width / 2;
                const boxY = lbl.ty - lbl.height / 2;
                
                ctx.fillStyle = lbl.isHeader ? lbl.objColor : "#ffffff";
                ctx.fillRect(boxX, boxY, lbl.width, lbl.height);
                
                ctx.strokeStyle = lbl.objColor;
                ctx.lineWidth = 1 / scale;
                ctx.strokeRect(boxX, boxY, lbl.width, lbl.height);

                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                
                let cursorY = boxY + LABEL_PADDING;
                const lineHeight = lbl.isHeader ? FONT_HEIGHT_HEADER : FONT_HEIGHT_DETAIL;
                
                lbl.textLines.forEach((line, i) => {
                    ctx.fillStyle = lbl.isHeader ? "#ffffff" : "#1e293b";
                    
                    if (lbl.isHeader && i === 0) {
                        // Main Header - Roboto Mono for technical look
                        ctx.font = `bold ${14 / scale}px 'Roboto Mono', monospace`;
                    } else if (lbl.isHeader) {
                        ctx.font = `${10 / scale}px 'Roboto Mono', monospace`;
                        ctx.fillStyle = "rgba(255,255,255,0.9)";
                    } else {
                        // Details - Inter
                        if (i === 0) ctx.font = `bold ${11 / scale}px 'Inter', sans-serif`;
                        else ctx.font = `${9 / scale}px 'Inter', sans-serif`;
                    }

                    ctx.fillText(line, boxX + LABEL_PADDING, cursorY);
                    cursorY += lineHeight;
                });
            });
        }

        ctx.restore();

        if (isVideo) {
            animationFrameId = requestAnimationFrame(render);
        }
    };

    render();

    return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };

  }, [imageSrc, data, liveDetections, layout, scale, offset, visibleObjects, isVideo, videoRef, imgDims]);

  // --- Input Handlers (Mouse) ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    // Allow zooming closer and further
    const newScale = Math.max(0.05, Math.min(8, scale - e.deltaY * 0.001));
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
  };

  // --- Input Handlers (Touch) ---
  const handleTouchStart = (e: React.TouchEvent) => {
      // 1 Finger = Pan
      if (e.touches.length === 1) {
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
          setIsDragging(true);
      } 
      // 2 Fingers = Pinch Zoom
      else if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          initialPinchDistanceRef.current = dist;
          initialScaleRef.current = scale;
          setIsDragging(false); // Disable dragging during zoom
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      e.preventDefault(); // Prevent page scroll
      
      // Pan
      if (e.touches.length === 1 && isDragging) {
          setOffset({ 
              x: e.touches[0].clientX - dragStart.x, 
              y: e.touches[0].clientY - dragStart.y 
          });
      } 
      // Pinch Zoom
      else if (e.touches.length === 2 && initialPinchDistanceRef.current) {
          const currentDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          
          const delta = currentDist / initialPinchDistanceRef.current;
          const newScale = Math.max(0.05, Math.min(8, initialScaleRef.current * delta));
          setScale(newScale);
      }
  };

  const handleTouchEnd = () => {
      setIsDragging(false);
      initialPinchDistanceRef.current = null;
  };
  
  return (
    <div className="relative w-full h-full bg-gray-100 overflow-hidden cursor-move border-t border-b border-gray-200"
         onWheel={handleWheel}
         onMouseDown={handleMouseDown}
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onMouseLeave={handleMouseUp}
         onTouchStart={handleTouchStart}
         onTouchMove={handleTouchMove}
         onTouchEnd={handleTouchEnd}
         onTouchCancel={handleTouchEnd}
    >
      {/* Video Element (Hidden logic, driven by controls) */}
      {isVideo && (
          <video 
            ref={videoRef}
            src={imageSrc}
            // Loop enabled
            loop
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            muted={false} // Allow audio
            playsInline
          />
      )}

      {/* Floating Toolbar */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button 
             onClick={() => { setScale(0.45); setOffset({x: 0, y: 0}); }}
             className="bg-white/90 backdrop-blur border border-gray-300 text-gray-700 px-3 py-2 rounded shadow-sm text-xs font-bold hover:bg-gray-50 active:bg-gray-200"
          >
             Reset
          </button>
          <button 
             onClick={() => onExportPDF && onExportPDF()}
             className="bg-corp-primary/90 backdrop-blur text-white px-3 py-2 rounded shadow-sm text-xs font-bold hover:bg-blue-700 flex items-center gap-1 active:bg-blue-800"
          >
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
             PDF
          </button>
      </div>

      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
      
      {/* SUBTITLES OVERLAY */}
      {isVideo && data?.audio_analysis?.subtitles && (
          <div className="absolute bottom-8 left-0 w-full flex justify-center pointer-events-none">
              {data.audio_analysis.subtitles.map((sub, i) => {
                  const start = parseTimestamp(sub.start);
                  const end = parseTimestamp(sub.end);
                  if (currentTime >= start && currentTime <= end) {
                      return (
                          <div key={i} className="bg-black/70 text-white px-4 py-2 rounded text-sm font-sans mb-2 backdrop-blur-sm mx-4 text-center">
                              {sub.text}
                          </div>
                      )
                  }
                  return null;
              })}
          </div>
      )}

      {/* Timestamp Indicator */}
      {isVideo && (
          <div className="absolute top-4 left-4 bg-white/90 border border-gray-300 text-gray-800 px-3 py-1 rounded shadow-sm text-xs font-mono font-bold">
              T: {Math.floor(currentTime / 60).toString().padStart(2, '0')}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}
          </div>
      )}
    </div>
  );
};

export default PaperCanvas;
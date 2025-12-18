import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AnalysisResult } from "../types";

export const generateForensicReport = async (data: AnalysisResult, imageSrc: string | null) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let cursorY = margin;

  // --- Helper Functions ---
  const addHeader = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(title, margin, cursorY);
    cursorY += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY - 5, pageWidth - margin, cursorY - 5);
    doc.setFont("helvetica", "normal");
  };

  const checkPageBreak = (neededSpace: number) => {
    if (cursorY + neededSpace > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
  };

  // --- 1. TITLE PAGE / HEADER ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text("INFORME PERICIAL TÉCNICO", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 15;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`ID EXPEDIENTE: ${Date.now()}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 5;
  doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleString()}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 5;
  doc.text("GENERADO POR: CHRONOS NEURAL INTERFACE (AI FORENSIC UNIT)", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 20;

  // --- 2. EVIDENCE IMAGE ---
  if (imageSrc) {
    try {
      // Scale image to fit within margins, max height 80mm
      const imgProps = doc.getImageProperties(imageSrc);
      const imgHeight = (imgProps.height * (pageWidth - 2 * margin)) / imgProps.width;
      const finalHeight = Math.min(imgHeight, 100);
      
      doc.addImage(imageSrc, "JPEG", margin, cursorY, pageWidth - 2 * margin, finalHeight);
      cursorY += finalHeight + 10;
    } catch (e) {
      doc.setTextColor(255, 0, 0);
      doc.text("[Error al procesar imagen de evidencia]", margin, cursorY);
      cursorY += 10;
    }
  }

  // --- 3. EXECUTIVE SUMMARY ---
  checkPageBreak(40);
  addHeader("1. RESUMEN EJECUTIVO");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const splitSummary = doc.splitTextToSize(data.summary, pageWidth - 2 * margin);
  doc.text(splitSummary, margin, cursorY);
  cursorY += splitSummary.length * 5 + 10;

  // --- 4. MEDIA COMPARISON REPORT (NEW) ---
  if (data.comparison_analysis) {
      checkPageBreak(60);
      addHeader("2. ANÁLISIS COMPARATIVO FORENSE");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`INTEGRIDAD: ${data.comparison_analysis.media_integrity}`, margin, cursorY);
      doc.text(`SIMILITUD: ${data.comparison_analysis.similarity_score}%`, margin + 100, cursorY);
      cursorY += 10;

      doc.setFont("helvetica", "normal");
      const conc = doc.splitTextToSize(`CONCLUSIÓN: ${data.comparison_analysis.conclusion}`, pageWidth - 2 * margin);
      doc.text(conc, margin, cursorY);
      cursorY += conc.length * 5 + 5;

      if (data.comparison_analysis.visual_discrepancies.length > 0) {
          // @ts-ignore
          autoTable(doc, {
              startY: cursorY,
              head: [['Timestamp', 'Discrepancia Visual']],
              body: data.comparison_analysis.visual_discrepancies.map(d => [d.timestamp, d.description]),
              theme: 'grid',
              headStyles: { fillColor: [100, 100, 100] },
          });
          // @ts-ignore
          cursorY = doc.lastAutoTable.finalY + 10;
      }

      if (data.comparison_analysis.audio_discrepancies.length > 0) {
          // @ts-ignore
          autoTable(doc, {
              startY: cursorY,
              head: [['Timestamp', 'Anomalía de Audio']],
              body: data.comparison_analysis.audio_discrepancies.map(d => [d.timestamp, d.description]),
              theme: 'grid',
              headStyles: { fillColor: [150, 100, 50] },
          });
          // @ts-ignore
          cursorY = doc.lastAutoTable.finalY + 15;
      }
  }

  // --- 5. SECURITY EVENTS (CRITICAL) ---
  if (data.events && data.events.length > 0) {
    checkPageBreak(50);
    addHeader("3. EVENTOS DE SEGURIDAD Y AMENAZAS");
    
    // @ts-ignore
    autoTable(doc, {
      startY: cursorY,
      head: [['Hora', 'Tipo', 'Severidad', 'Descripción']],
      body: data.events.map(evt => [
        evt.timestamp,
        evt.type,
        evt.severity,
        evt.description
      ]),
      headStyles: { fillColor: [200, 0, 0] }, // Red header for security
      theme: 'grid',
    });
    // @ts-ignore
    cursorY = doc.lastAutoTable.finalY + 15;
  }

  // --- 6. AUDIO & ENVIRONMENTAL ANALYSIS ---
  if (data.audio_analysis && data.audio_analysis.detected) {
      checkPageBreak(60);
      addHeader("4. ANÁLISIS ACÚSTICO Y AMBIENTAL");
      
      const audioData = [
          ["Clase Ambiental", data.audio_analysis.environment_class || "N/A"],
          ["Sonidos Detectados", (data.audio_analysis.detected_sounds || []).join(", ")],
          ["Idioma Detectado", data.audio_analysis.language],
          ["Procedencia Hablante", data.audio_analysis.speaker_profile?.provenance || "N/A"],
      ];

      // @ts-ignore
      autoTable(doc, {
          startY: cursorY,
          head: [['Parámetro', 'Resultado']],
          body: audioData,
          theme: 'striped',
          styles: { cellWidth: 'wrap' },
          columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }
      });
      
      // @ts-ignore
      cursorY = doc.lastAutoTable.finalY + 5;

      // Transcription
      if (data.audio_analysis.transcript_excerpt) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(9);
          doc.setTextColor(80, 80, 80);
          const trans = `TRANSCRIPCIÓN: "${data.audio_analysis.transcript_excerpt}"`;
          const splitTrans = doc.splitTextToSize(trans, pageWidth - 2 * margin);
          doc.text(splitTrans, margin, cursorY + 5);
          cursorY += splitTrans.length * 5 + 15;
      }
  }

  // --- 7. BIOMETRICS & SOCIAL RECON (OSINT) ---
  const faces = data.objects.filter(o => o.biometrics?.is_face);
  if (faces.length > 0) {
      checkPageBreak(60);
      addHeader("5. IDENTIFICACIÓN BIOMÉTRICA Y OSINT");

      const osintRows: any[] = [];
      faces.forEach(face => {
          if (face.biometrics?.social_matches && face.biometrics.social_matches.length > 0) {
              face.biometrics.social_matches.forEach(match => {
                  osintRows.push([
                      face.name || "Sujeto Desconocido",
                      match.profile_name,
                      `${match.score}%`,
                      match.platform,
                      match.url
                  ]);
              });
          }
      });

      if (osintRows.length > 0) {
          doc.setFontSize(10);
          doc.text("Coincidencias en Redes Sociales (Confidence > 80%):", margin, cursorY);
          cursorY += 5;
          // @ts-ignore
          autoTable(doc, {
              startY: cursorY,
              head: [['Sujeto', 'Perfil Hallado', '% Match', 'Plataforma', 'URL']],
              body: osintRows,
              theme: 'grid',
              headStyles: { fillColor: [0, 100, 200] },
          });
          // @ts-ignore
          cursorY = doc.lastAutoTable.finalY + 15;
      } else {
          doc.setFontSize(10);
          doc.text("No se hallaron coincidencias públicas con el umbral de confianza requerido.", margin, cursorY);
          cursorY += 15;
      }
  }

  // --- 8. DETAILED OBJECTS & TRACKING ---
  checkPageBreak(60);
  addHeader("6. ANÁLISIS DE OBJETOS Y CINEMÁTICA");
  
  const objectRows = data.objects.map(obj => [
      obj.timestamp || "N/A",
      obj.tracking?.track_id || obj.id.substring(0,4),
      obj.name,
      obj.tracking?.estimated_speed || "Estático",
      obj.material,
      obj.state
  ]);

  // @ts-ignore
  autoTable(doc, {
      startY: cursorY,
      head: [['Tiempo', 'ID Track', 'Clasificación', 'Velocidad Est.', 'Material', 'Estado/Emoción']],
      body: objectRows,
      theme: 'striped',
  });
  // @ts-ignore
  cursorY = doc.lastAutoTable.finalY + 15;

  // --- 9. METADATA & PROVENANCE ---
  checkPageBreak(50);
  addHeader("7. METADATOS Y PROCEDENCIA");

  const metaData = [
      ["Archivo", data.metadata_analysis?.technical_metadata.filename || "N/A"],
      ["Mime Type", data.metadata_analysis?.technical_metadata.mime_type || "N/A"],
      ["Dispositivo (Est.)", data.metadata_analysis?.inferred_metadata.creation_device || "N/A"],
      ["Ubicación (Pistas)", data.metadata_analysis?.inferred_metadata.location_clues || "N/A"],
  ];

  // @ts-ignore
  autoTable(doc, {
      startY: cursorY,
      body: metaData,
      theme: 'plain',
      styles: { fontSize: 9 },
  });
  // @ts-ignore
  cursorY = doc.lastAutoTable.finalY + 10;

  // Links
  if (data.web_provenance && data.web_provenance.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Referencias Web (Grounding):", margin, cursorY);
      cursorY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 255);
      
      data.web_provenance.forEach(link => {
          checkPageBreak(10);
          const text = `- ${link.source_title}: ${link.url}`;
          doc.textWithLink(text, margin, cursorY, { url: link.url });
          cursorY += 6;
      });
      doc.setTextColor(0,0,0);
  }

  // --- FOOTER ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${totalPages} - Informe Pericial Chronos - Confidencial`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }

  // Save
  doc.save(`Peritaje_Chronos_${Date.now()}.pdf`);
};
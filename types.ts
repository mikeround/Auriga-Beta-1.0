
export interface BlueprintObject {
  id: string;
  name: string; // Used for "Subject A", "John Doe", etc.
  color: string;
  // Bounding box: [ymin, xmin, ymax, xmax] (0-1000 scale)
  box_2d: [number, number, number, number];
  material: string; 
  state: string; // Used for Emotion/Expression in Face mode
  distinctive_feature: string; 
  details: BlueprintDetail[];
  timestamp?: string; // e.g. "00:04" for video analysis
  
  // New Biometric Fields
  biometrics?: {
    is_face: boolean;
    estimated_age?: string;
    gender_presentation?: string;
    ethnicity_phenotype?: string;
    emotion_confidence?: number;
    match_score?: number; // 0-100 Comparison score against reference
    cluster_id?: string; // For grouping same people in video/image
    
    // New Social Recon Field
    social_matches?: {
      platform: string; // "LinkedIn", "Twitter", "Facebook", "Web"
      profile_name: string;
      url: string;
      confidence: string; // "High", "Possible", "Low"
      score: number; // 0-100 Match Percentage (Threshold 92 -> 80)
    }[];
  };

  // New Tracking Fields
  tracking?: {
    track_id: string; // Persistent ID across frames (e.g., "OBJ_001")
    trajectory: [number, number][]; // Array of [y, x] coordinates (0-1000) representing path history
    velocity_vector?: string; // e.g., "High Speed North", "Static"
    estimated_speed?: string; // e.g. "45 km/h", "Running (12 km/h)", "Static"
    prediction?: string; // Future position estimation
  };
}

export interface BlueprintDetail {
  name: string;
  location_point: [number, number]; 
  description: string;
}

export interface LiveDetection {
  label: string;
  box_2d: [number, number, number, number];
  timestamp?: number; // Timestamp of the video frame when detection was captured
}

export interface SubtitleSegment {
  start: string; // "MM:SS"
  end: string;   // "MM:SS"
  text: string;
}

export interface AudioAnalysis {
  detected: boolean;
  language: string;
  environment_class: string; // New: "Urban", "Nature", "Warzone", "Indoor"
  detected_sounds: string[]; // New: ["Gunshot", "Scream", "Car Engine"]
  transcript_excerpt: string;
  subtitles?: SubtitleSegment[]; // Added specifically for synchronized captions
  speaker_profile: {
    provenance: string; 
    demographics: string; 
    confidence_note: string; 
  } | null;
}

export interface WebProvenance {
  source_title: string;
  url: string;
  relevance: string; // e.g., "Exact Match", "Similar Item", "Historical Context"
}

export interface MetadataAnalysis {
  technical_metadata: {
    filename: string;
    file_size: string;
    mime_type: string;
    last_modified: string;
  };
  inferred_metadata: {
    creation_device: string; // e.g. "Smartphone Camera (Est.)", "Digital Scanner"
    location_clues: string; // Visible GPS data, signage, etc.
    original_date_est: string;
  };
}

// New Security Event Interface
export interface SecurityEvent {
  type: 'FALL' | 'FIGHT' | 'ENTRY_EXIT' | 'ANOMALY' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string; // "MM:SS"
  description: string;
  involved_object_ids: string[]; // IDs from BlueprintObject
}

// Comparison Analysis Interface
export interface ComparisonAnalysis {
  is_identical: boolean;
  similarity_score: number; // 0-100
  media_integrity: string; // "Authentic", "Manipulated", "Inconclusive"
  visual_discrepancies: {
    timestamp: string;
    description: string;
    region?: [number, number, number, number]; // Area of manipulation
  }[];
  audio_discrepancies: {
    timestamp: string;
    description: string;
  }[];
  conclusion: string;
}

// NEW: Deepfake Analysis Interface
export interface DeepfakeAnalysis {
  is_deepfake: boolean;
  confidence_score: number; // 0-100 probability of being Fake
  verdict: 'REAL' | 'FAKE' | 'SUSPICIOUS';
  visual_anomalies: {
    region: string; // e.g., "Eyes", "Mouth", "Shadows", "Skin Texture"
    description: string; // e.g., "Irregular blinking pattern", "Mismatched earrings"
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  audio_anomalies: {
    timestamp: string;
    description: string; // e.g., "Robotic tone", "Lip sync mismatch"
  }[];
  // NEW AUDIO FORENSICS SECTION
  audio_forensics?: {
    frequency_analysis: string; // e.g. "High-freq cutoff at 8kHz detected"
    noise_floor_consistency: string; // e.g. "Unnatural/Absolute Silence" vs "Natural Room Tone"
    breathing_patterns: string; // e.g. "No breath intakes detected (Inhuman)"
    spectral_consistency: string; // e.g. "Metallic artifacts present"
  };
  // NEW SOCIAL ENGINEERING SECTION
  social_engineering_flags?: {
    flag: string; // e.g. "Urgency", "Authority Appeal", "Fear"
    description: string;
  }[];
  digital_watermarks: {
    detected: boolean;
    type?: string; // e.g. "SynthID Pattern", "C2PA Missing", "AI Generation Metadata"
    details: string;
  };
  conclusion: string;
}

export interface AnalysisResult {
  objects: BlueprintObject[];
  events?: SecurityEvent[]; // New field for detected events
  comparison_analysis?: ComparisonAnalysis; // New field for media comparison
  deepfake_analysis?: DeepfakeAnalysis; // New field for deepfake evaluation
  audio_analysis: AudioAnalysis | null;
  web_provenance: WebProvenance[];
  metadata_analysis: MetadataAnalysis | null;
  summary: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export enum AppState {
  IDLE,
  ANALYZING,
  COMPLETE,
  ERROR
}
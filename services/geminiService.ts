import { GoogleGenAI, Schema, Type } from "@google/genai";
import { AnalysisResult, LiveDetection, ChatMessage } from '../types';

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- CHAT WITH SYSTEM FUNCTION ---
export const processChatCommand = async (
  userMessage: string,
  chatHistory: ChatMessage[],
  currentContext: AnalysisResult | null
): Promise<string> => {
  const model = "gemini-2.5-flash";

  // Prepare context from the analysis result (if available)
  const contextString = currentContext 
    ? JSON.stringify(currentContext, null, 2)
    : "No analysis data currently loaded. System is idle.";

  // Prepare recent history (last 5 turns to save tokens)
  const recentHistory = chatHistory.slice(-10).map(msg => 
    `${msg.sender === 'user' ? 'OPERATOR' : 'SYSTEM'}: ${msg.text}`
  ).join('\n');

  const systemPrompt = `
    Eres "Chronos", una suite de análisis forense profesional.
    Tu objetivo es asistir al operador respondiendo preguntas sobre los datos analizados o ejecutando comandos simulados.
    
    CONTEXTO DE DATOS ACTUAL (JSON):
    ${contextString}

    HISTORIAL DE CONVERSACIÓN RECIENTE:
    ${recentHistory}

    INSTRUCCIONES:
    1. Responde de forma concisa, puramente técnica y profesional. Evita jerga de ciencia ficción.
    2. Si el usuario pregunta por objetos, velocidades, eventos de seguridad o metadatos, USA el JSON proporcionado arriba para responder con precisión.
    3. Si el usuario pide algo que no está en el JSON, indícalo claramente como "Datos no disponibles".
    4. Trata al usuario como "Analista" u "Operador".
    5. Idioma de respuesta: Español (a menos que el operador hable en otro idioma).

    PREGUNTA DEL OPERADOR:
    ${userMessage}
  `;

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: { parts: [{ text: systemPrompt }] },
      config: { temperature: 0.5 }
    });

    return response.text || "SYSTEM_ERROR: No response generated.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "CONNECTION_FAILURE: Service unreachable.";
  }
};


// --- SCHEMA DEFINITION FOR PROMPT (TEXT BASED) ---
// Since we use Google Search tool, we cannot use 'responseSchema' in config.
// We must instruct the model to output JSON in the text prompt.
const JSON_STRUCTURE_PROMPT = `
DEBES devolver el resultado EXCLUSIVAMENTE en formato JSON válido, sin bloques de código markdown (no uses \`\`\`json).
La estructura debe coincidir con esta interfaz TypeScript:

interface AnalysisResult {
  objects: {
    id: string;
    name: string; // Nombre, Etiqueta del sujeto o "Sujeto A"
    color: string; // Hex code (Use colores legibles y profesionales)
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    material: string; // O "Piel / Tez" en caso de rostros
    state: string; // O Emoción/Expresión en caso de rostros
    distinctive_feature: string;
    details: { name: string; location_point: [number, number]; description: string; }[];
    timestamp?: string; // IMPORTANTE: Para vídeo, formato "MM:SS" (ej: "00:04").
    
    // NEW BIOMETRIC FIELDS (Usa estos si el protocolo es Facial)
    biometrics?: {
       is_face: boolean;
       estimated_age?: string;
       gender_presentation?: string;
       ethnicity_phenotype?: string;
       emotion_confidence?: number;
       match_score?: number; // 0-100 score de coincidencia con la imagen de referencia (si existe)
       cluster_id?: string; // ID único para agrupar a la misma persona (ej: "PERSON_01")
       
       // SOCIAL RECON FIELDS
       social_matches?: {
          platform: string; // ej: "LinkedIn", "Twitter/X", "Facebook", "Instagram"
          profile_name: string; // Nombre encontrado en el perfil
          url: string; // URL directa al perfil
          confidence: string; // "High", "Possible"
          score: number; // Porcentaje de coincidencia visual (ej: 95, 82)
       }[];
    };

    // NEW TRACKING FIELDS (Usa estos si el protocolo es Tracking)
    tracking?: {
       track_id: string; // ID PERSISTENTE (ej: "CAR_01", "PERSON_A"). Debe mantenerse igual si es el mismo objeto.
       trajectory: [number, number][]; // Array de coordenadas [y, x] (0-1000) de la historia de movimiento PREVIA hasta este momento.
       velocity_vector?: string; // ej: "Rápido al Norte"
       estimated_speed?: string; // ej: "45 km/h", "Paso ligero", "Estático"
    };

  }[];

  // NEW SECURITY EVENTS
  events?: {
      type: 'FALL' | 'FIGHT' | 'ENTRY_EXIT' | 'ANOMALY' | 'OTHER';
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      timestamp: string; // "MM:SS"
      description: string;
      involved_object_ids: string[]; // IDs de los objetos involucrados
  }[];

  // NEW COMPARISON ANALYSIS (Rellenar SI Y SOLO SI el protocolo es 'media_compare')
  comparison_analysis?: {
      is_identical: boolean; // True si no hay manipulaciones
      similarity_score: number; // 0-100
      media_integrity: string; // "Authentic", "Manipulated", "Inconclusive"
      visual_discrepancies: {
        timestamp: string;
        description: string; // Ej: "Objeto eliminado en frame 120", "Sombras inconsistentes"
        region?: [number, number, number, number];
      }[];
      audio_discrepancies: {
        timestamp: string;
        description: string; // Ej: "Corte abrupto en espectrograma", "Voz sintética detectada"
      }[];
      conclusion: string; // Veredicto final del peritaje
  };

  // NEW DEEPFAKE ANALYSIS (Rellenar SI Y SOLO SI el protocolo es 'deepfake')
  deepfake_analysis?: {
      is_deepfake: boolean;
      confidence_score: number; // 0-100 probabilidad de ser FAKE
      verdict: 'REAL' | 'FAKE' | 'SUSPICIOUS';
      visual_anomalies: {
          region: string; // e.g. "Ojos", "Boca", "Sombras", "Manos"
          description: string; // e.g. "Parpadeo irregular", "Dedos extra", "Textura de piel cerosa"
          severity: 'LOW' | 'MEDIUM' | 'HIGH';
      }[];
      audio_anomalies: {
          timestamp: string;
          description: string; // e.g. "Tono metálico", "Desincronización labial"
      }[];
      // NEW AUDIO FORENSICS (Específico para análisis de voz/audio deepfake)
      audio_forensics?: {
        frequency_analysis: string; // e.g. "High-freq cutoff detectado a 8kHz", "Rango completo natural"
        noise_floor_consistency: string; // e.g. "Silencio Digital Absoluto (Artificial)" vs "Ruido Ambiente Natural"
        breathing_patterns: string; // e.g. "Ausencia total de respiración", "Patrón de aire natural"
        spectral_consistency: string; // e.g. "Artefactos metálicos detectados", "Transiciones suaves"
      };
      // NEW SOCIAL ENGINEERING (Contexto y Lógica)
      social_engineering_flags?: {
        flag: string; // e.g. "Urgencia Extrema", "Apelación a Autoridad", "Solicitud Dinero/Credenciales"
        description: string;
      }[];
      digital_watermarks: {
          detected: boolean;
          type?: string; // e.g. "SynthID Pattern", "Posible AI Metadata"
          details: string;
      };
      conclusion: string;
  };

  audio_analysis: {
    detected: boolean;
    language: string;
    environment_class: string; // Clasificación ambiental: "Urbano", "Interior", "Naturaleza", "Conflicto", etc.
    detected_sounds: string[]; // Lista de sonidos: ["Disparo", "Grito", "Motor Vehículo", "Explosión"]
    transcript_excerpt: string; // Transcripción completa o resumen detallado
    subtitles: { start: string; end: string; text: string; }[]; // ARRAY CRÍTICO PARA SUBTÍTULOS
    speaker_profile: {
      provenance: string;
      demographics: string;
      confidence_note: string;
    } | null;
  } | null;
  web_provenance: {
    source_title: string;
    url: string;
    relevance: string; // "Exact Match", "Similar Model", "Context"
  }[];
  metadata_analysis: {
    technical_metadata: {
      filename: string;
      file_size: string;
      mime_type: string;
      last_modified: string;
    };
    inferred_metadata: {
      creation_device: string; // e.g. "Smartphone", "CCTV", "Unknown"
      location_clues: string; // Visible GPS data, signage, etc.
      original_date_est: string;
    };
  };
  summary: string;
}
`;

// --- FULL ANALYSIS FUNCTION ---
export const analyzeImage = async (
  base64Data: string, 
  mimeType: string, 
  detailLevel: number,
  language: string,
  focus: string,
  rawFileMetadata: string, // New parameter for metadata context
  referenceBase64?: string, // Optional Reference Image for Comparison
  referenceMimeType?: string, // Added for correct MIME type handling
  userLocation?: { lat: number, lng: number } // Optional User Location
): Promise<AnalysisResult> => {
  const model = "gemini-2.5-flash";
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');
  
  let detailPrompt = "";
  if (detailLevel < 50) {
    detailPrompt = "Identifica solo los elementos principales con certeza absoluta.";
  } else {
    detailPrompt = "Analiza minuciosamente textos, texturas y materiales específicos.";
  }

  const focusMap: Record<string, string> = {
    'general': 'Proporciona un análisis técnico equilibrado. PERO SI DETECTAS UNA AMENAZA (Pelea, Caída), CAMBIA A PROTOCOLO DE SEGURIDAD AUTOMÁTICAMENTE.',
    'security': 'PRIORIDAD MÁXIMA: DETECCIÓN DE EVENTOS. Busca activamente Caídas, Peleas, Intrusiones, Armas o Comportamiento Anómalo. Sé muy sensible a cualquier riesgo.',
    'materials': 'PRIORIDAD: Identificación exacta de materiales y procesos.',
    'damage': 'PRIORIDAD: Detección de fallos y desgaste.',
    'historic': 'PRIORIDAD: Análisis de procedencia histórica y estilo.',
    'forensic': 'PRIORIDAD: Perfilado biológico, procedencia y metadatos.',
    'face_detect': 'PRIORIDAD: RECONOCIMIENTO FACIAL OSINT. Identifica rostros. USA GOOGLE SEARCH para buscar la identidad en redes sociales (LinkedIn, Twitter, Facebook). Rellena "social_matches" si encuentras perfiles.',
    'bio_compare': 'PRIORIDAD: COMPARACIÓN BIOMÉTRICA. Compara las caras de la imagen principal con la IMAGEN DE REFERENCIA proporcionada. Calcula "match_score" (0-100).',
    'clustering': 'PRIORIDAD: AGRUPACIÓN. Asigna un "cluster_id" único a cada persona distinta. Si la misma persona aparece varias veces o en video, usa el mismo ID.',
    'tracking': 'PRIORIDAD: SEGUIMIENTO DE OBJETOS. Identifica objetos en movimiento. Asigna "track_id" único y persistente. Genera "trajectory" con el historial de puntos [y, x] para mostrar su camino.',
    'media_compare': 'PRIORIDAD: COTEJO FORENSE PROFUNDO (DEEP MEDIA COMPARISON). Compara el ARCHIVO 1 (Principal) con el ARCHIVO 2 (Referencia) buscando discrepancias de nivel inferior al 1%.',
    'deepfake': 'PRIORIDAD: DETECCIÓN DE DEEPFAKES (VISUAL Y AUDIO). Analiza señales físicas, acústicas y contexto.'
  };

  const focusInstruction = focusMap[focus] || focusMap['general'];

  let videoInstruction = "";
  if (isVideo || isAudio) {
    videoInstruction = `
    ESTO ES UN ARCHIVO DE ${isVideo ? 'VÍDEO' : 'AUDIO'}.
    MODO DE OPERACIÓN: CRONOLOGÍA COMPLETA Y ANÁLISIS ACÚSTICO AVANZADO.
    
    1. **ANÁLISIS ACÚSTICO (CRÍTICO)**:
       - Escucha atentamente el audio de fondo.
       - **DETECTAR EVENTOS**: Busca específicamente:
         a) **DISPAROS / ARMAS DE FUEGO**
         b) **GRITOS / PÁNICO**
         c) **EXPLOSIONES**
         d) **VEHÍCULOS (Motores, frenazos, sirenas)**
       - Lista estos sonidos en 'detected_sounds'.
       - **CLASIFICACIÓN AMBIENTAL**: Describe el entorno en 'environment_class' (ej: "Urbano Tráfico Intenso", "Interior Silencioso", "Zona de Guerra", "Naturaleza Bosque").
    
    2. Si es vídeo, analiza visualmente. Si es solo audio, enfócate 100% en el sonido.
    3. Genera una lista de objetos/sujetos detectados (por voz o imagen).
    4. Es CRÍTICO que el campo 'timestamp' (MM:SS) sea preciso. 
    5. AUDIO Y SUBTÍTULOS (CRÍTICO): 
       - Si hay voz, DEBES generar 'subtitles' sincronizados con precisión de segundos.
       - Formato tiempo: "MM:SS".
       - IDIOMA SUBTÍTULOS: ${language}. Traduce si el audio original es diferente.
    `;
  }
  
  // Construct the prompt content parts
  const parts: any[] = [];
  
  // 1. Reference Image (if provided for comparison)
  if (referenceBase64) {
      parts.push({ 
          inlineData: { data: referenceBase64, mimeType: referenceMimeType || "image/jpeg" } 
      });
      
      if (focus === 'media_compare') {
        parts.push({ text: "ARCHIVO DE REFERENCIA (FUENTE B) [Arriba]: Úsalo para COTEJAR discrepancias." });
      } else {
        parts.push({ text: "IMAGEN DE REFERENCIA (TARGET) [Arriba]: Úsala para comparar con la evidencia principal." });
      }
  }

  // 2. Main Evidence
  parts.push({ 
      inlineData: { data: base64Data, mimeType: mimeType } 
  });
  parts.push({ text: "ARCHIVO PRINCIPAL (FUENTE A) [Arriba]: Evidencia sujeta a análisis." });

  // 3. Text Prompt
  const prompt = `
    Actúa como un sistema profesional de análisis forense, seguridad y biométrico. Analiza la evidencia principal.
    
    METADATOS DEL ARCHIVO ORIGINAL:
    ${rawFileMetadata}

    UBICACIÓN DEL USUARIO (GROUNDING):
    ${userLocation ? `Lat: ${userLocation.lat}, Lng: ${userLocation.lng}` : "NO DISPONIBLE"}
    Si hay ubicación disponible, úsala junto con Google Maps para verificar landmarks o lugares visibles en la imagen.

    IDIOMA SALIDA: ${language}
    PROTOCOLO ACTIVO: ${focus}
    INSTRUCCIÓN DE PROTOCOLO: ${focusInstruction}
    
    ${videoInstruction}

    INSTRUCCIÓN ESPECÍFICA PARA 'MEDIA_COMPARE' (Cotejo Forense Exhaustivo):
    Si el protocolo es 'media_compare', DEBES rellenar el campo 'comparison_analysis'.
    **MODO: ESCANEO EXHAUSTIVO (DEEP SCAN)**.
    1. Compara Fuente A vs Fuente B FRAME A FRAME y PIXEL A PIXEL.
    2. **DETECTA DIFERENCIAS DEL 1% O MENOS**. Busca micro-variaciones que el ojo humano ignora.
    3. Busca **diferencias visuales sutiles**: 
       - Cambios leves en gradiente de color.
       - Sombras inconsistentes (pixelization).
       - Artefactos de interpolación (AI artifacts).
       - Objetos movidos milimétricamente.
    4. Busca **diferencias de audio imperceptibles**:
       - Micro-cortes (stuttering).
       - Cambios en el "noise floor" (suelo de ruido).
       - Diferencias en el espectrograma.
    5. Indica frame a frame (timestamp) dónde ocurren las variaciones.
    6. Determina si los archivos son idénticos o manipulados. Sé extremadamente estricto.

    INSTRUCCIÓN ESPECÍFICA PARA 'DEEPFAKE' (Detección de Manipulación IA):
    Si el protocolo es 'deepfake', DEBES rellenar el campo 'deepfake_analysis'.
    **MODO: CAZADOR DE SYNTH (SYNTH HUNTER)**.
    
    A. **ANÁLISIS DE AUDIO (ESCUCHA ACTIVA)** - Si hay audio, aplica esto estrictamente:
       1. **Micro-Irregularidades**: Busca "Glitching" robótico, saltos de fase o artefactos metálicos en las frecuencias altas.
       2. **Cortes de Frecuencia (Frequency Cut-off)**: Las IAs baratas a menudo cortan el espectro a 8kHz o 16kHz. ¿El audio suena "telefónico" o completo?
       3. **Silencio Digital Absoluto vs Ruido de Suelo (Noise Floor)**:
          - Audio REAL: Tiene "ruido de sala" (aire acondicionado, eco suave, ruido blanco).
          - Audio FAKE: A menudo tiene "0 dB Digital Silence" entre palabras. Esto es una señal CLARA de TTS (Text-to-Speech).
       4. **Marcadores Biológicos**:
          - **Respiración**: ¿El hablante toma aire? Las IAs a menudo olvidan inhalar antes de frases largas.
          - **Entonación Emocional**: ¿La emoción coincide con el contexto?
       5. **Latencia**: ¿Hay pausas antinaturales antes de responder?

    B. **VERIFICACIÓN DE CONTEXTO Y LÓGICA (INGENIERÍA SOCIAL)**:
       - Analiza el CONTENIDO del mensaje.
       - **Banderas Rojas (Social Engineering Flags)**:
         - **URGENCIA EXTREMA**: "Haz esto YA", "Emergencia", "Tu cuenta peligra".
         - **MIEDO**: Amenazas, consecuencias legales inmediatas.
         - **AUTORIDAD**: Suplantación de CEOs, Policía, Familiares.
         - **SOLICITUD ATÍPICA**: Pedir dinero, contraseñas, tarjetas regalo.
       - Rellena 'social_engineering_flags' con estos hallazgos.

    C. **ANÁLISIS VISUAL (Si es Vídeo/Imagen)**:
       - Ojos: ¿Parpadeo irregular? ¿Pupilas no circulares? ¿Reflejos inconsistentes en córnea?
       - Piel: ¿Textura excesivamente lisa (efecto cera)? ¿Porosidad realista?
       - Boca: ¿Dientes borrosos o demasiados dientes? ¿La lengua se mueve naturalmente? **Lip Sync**: ¿Los labios se mueven en perfecta sincronía con los fonemas?
       - Accesorios: ¿Pendientes diferentes en cada oreja? ¿Gafas asimétricas?
       - Manos: ¿Dedos extra o deformes?

    D. **MARCAS DE AGUA Y TECNOLOGÍA (SynthID/Metadata)**:
       - Analiza si hay patrones de ruido visibles característicos de difusión estable (Stable Diffusion).
       - Busca en los metadatos o píxeles señales de marcas de agua digitales.
    
    E. **BÚSQUEDA INVERSA (Google Search)**: 
       - Usa la herramienta de búsqueda para ver si la imagen/audio existe en bancos de datos reales.

    AUTOMATIZACIÓN DE PROTOCOLOS (AUTO-SWITCHING):
    Aunque el protocolo sea "general" o "tracking", TÚ TIENES AUTORIDAD para detectar eventos de ALTA PRIORIDAD.
    Si ves una CAÍDA, una PELEA o VIOLENCIA, rellena el campo 'events' inmediatamente con severity 'HIGH' o 'CRITICAL'.

    DEFINICIÓN DE EVENTOS DE SEGURIDAD (Para rellenar el campo 'events'):
    1. **CAÍDAS (FALL)**: Persona colapsando repentinamente, acostada en el suelo en posición no natural, tropiezos graves.
    2. **PELEAS (FIGHT)**: Interacción física agresiva entre 2+ sujetos, puñetazos, empujones violentos, postura de combate.
    3. **ENTRADAS/SALIDAS (ENTRY_EXIT)**: Personas cruzando puertas, umbrales o zonas restringidas. Indica si es 'Entrada' o 'Salida'.
    4. **ANOMALÍAS (ANOMALY)**: Merodeo excesivo, correr en zonas pasivas, objetos abandonados, uso de máscaras/pasamontañas.

    INSTRUCCIÓN ESPECÍFICA PARA ROSTROS (Si el protocolo es face_detect, bio_compare o clustering):
    1. Usa el campo 'biometrics' dentro de 'objects'.
    2. 'material' debe ser la descripción de la piel/tez.
    3. 'state' debe ser la Emoción dominante.
    4. 'details' debe incluir puntos de referencia faciales (Landmarks).
    
    **CRÍTICO: OSINT SOCIAL SEARCH (Búsqueda de Perfiles)**:
    Si detectas un rostro, usa Google Search para buscar coincidencias en LinkedIn, Twitter, Facebook, etc.
    REGLA ESTRICTA DE COINCIDENCIA (Rate de Acierto):
    1. **PRIMER NIVEL (92%+)**: Busca perfiles con una similitud visual y de contexto > 92%. Estos son "High" confidence.
    2. **SEGUNDO NIVEL (80%+)**: SOLO si no encuentras coincidencias >92%, acepta perfiles con similitud > 80%. Estos son "Possible" confidence.
    3. **DESCARTAR**: Cualquier coincidencia menor al 80% DEBE SER DESCARTADA.
    
    Rellena 'social_matches' con:
    - platform: Red social.
    - profile_name: Nombre exacto.
    - url: Link directo al perfil.
    - confidence: "High" (>92%) o "Possible" (>80%).
    - score: El porcentaje numérico estimado (ej: 95, 84).

    INSTRUCCIÓN ESPECÍFICA PARA TRACKING y VELOCIDAD (Si hay movimiento o es Video):
    1. Usa el campo 'tracking' dentro de 'objects'.
    2. 'track_id' debe ser constante para el mismo objeto (ej: "Red Car") aunque se mueva.
    3. 'trajectory' debe ser un array de puntos [y, x] (0-1000).
    4. **VELOCIDAD (estimated_speed)**:
       - Estima la velocidad de vehículos y personas.
       - Si es un video, calcula basándote en la distancia recorrida.
       - Si es imagen estática, estima basándote en desenfoque de movimiento (motion blur) o contexto (ej: persona en posición de sprint).
       - Formato: "XX km/h" o descriptivo "Walking (5km/h)", "Running (15km/h)".
       - AUTOMATIZACIÓN: Rellena esto SIEMPRE que detectes movimiento, independientemente del protocolo.

    TAREAS CRÍTICAS:
    1. **BÚSQUEDA WEB (GROUNDING)**: Usa la herramienta de búsqueda para encontrar la procedencia de los objetos, obras de arte o personas (si son públicas).
    2. **ANÁLISIS DE METADATOS**: Completa 'technical_metadata' y 'inferred_metadata'.
    3. **PERFILADO**: Completa 'audio_analysis' INCLUYENDO 'environment_class' y 'detected_sounds'.
    4. **BLUEPRINT**: Genera la lista de objetos o rostros.
    5. **SEGURIDAD**: Genera la lista de 'events' si aplica.
    6. **MAPAS**: Si encuentras lugares específicos, usa Google Maps para validar y añadir a 'web_provenance'.
    7. **COMPARACIÓN**: Si 'media_compare', completa 'comparison_analysis'.
    8. **DEEPFAKE**: Si 'deepfake', completa 'deepfake_analysis'.

    ${JSON_STRUCTURE_PROMPT}
  `;
  
  parts.push({ text: prompt });

  // --- CONFIG TOOLS ---
  const tools: any[] = [{ googleSearch: {} }];
  let toolConfig = undefined;

  // Add Google Maps if location is available
  if (userLocation) {
      tools.push({ googleMaps: {} });
      toolConfig = {
          retrievalConfig: {
              latLng: {
                  latitude: userLocation.lat,
                  longitude: userLocation.lng
              }
          }
      };
  }

  // Define Config
  let generationConfig: any = {
        // IMPORTANT: No responseSchema/MimeType when using googleSearch tool in this context
        // to avoid conflicts, we rely on the prompt to enforce JSON.
        tools: tools,
        toolConfig: toolConfig,
        temperature: 0.1,
  };

  // Enable Thinking Config for Deep Scans (Media Compare or Deepfake)
  if (focus === 'media_compare' || focus === 'deepfake') {
      generationConfig = {
          ...generationConfig,
          thinkingConfig: { thinkingBudget: 8192 }, // Allocate budget for "Exhaustive Scan"
          maxOutputTokens: 65536, // Ensure ample space for detailed diff report
      };
  }

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: {
        parts: parts
      },
      config: generationConfig
    });

    let text = response.text || "{}";
    
    // --- ROBUST JSON EXTRACTION ---
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch) {
        text = jsonBlockMatch[1];
    } else {
        const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            text = codeBlockMatch[1];
        } else {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                text = text.substring(firstBrace, lastBrace + 1);
            }
        }
    }
    
    // Parse JSON
    let result: AnalysisResult;
    try {
        result = JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse JSON raw text:", response.text);
        throw new Error("Analysis generated invalid format. Please retry.");
    }

    // --- SANITIZATION ---
    if (!result.objects || !Array.isArray(result.objects)) {
        result.objects = [];
    }
    result.objects.forEach(obj => {
        if (!obj.details || !Array.isArray(obj.details)) {
            obj.details = [];
        }
        if (!obj.box_2d || !Array.isArray(obj.box_2d)) {
            obj.box_2d = [0, 0, 0, 0];
        }
    });
    if (!result.web_provenance || !Array.isArray(result.web_provenance)) {
        result.web_provenance = [];
    }
    if (!result.events || !Array.isArray(result.events)) {
        result.events = [];
    }
    // --------------------

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
        const groundingLinks: any[] = [];
        
        groundingChunks.forEach((chunk: any) => {
            // Process Web Search
            if (chunk.web && chunk.web.uri) {
                groundingLinks.push({
                    source_title: chunk.web.title || "Web Source",
                    url: chunk.web.uri,
                    relevance: "Grounding Reference"
                });
            }
            // Process Google Maps
            if (chunk.maps && chunk.maps.uri) {
                groundingLinks.push({
                    source_title: chunk.maps.title || "Google Maps Location",
                    url: chunk.maps.uri,
                    relevance: "Location Verification"
                });
            }
        });
        
        if (groundingLinks.length > 0) {
            groundingLinks.forEach(link => {
                if(!result.web_provenance.some(wp => wp.url === link.url)) {
                    result.web_provenance.push(link);
                }
            });
        }
    }

    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

// --- LIVE DETECTION FUNCTION ---
export const detectLiveObjects = async (base64Data: string): Promise<LiveDetection[]> => {
  const model = "gemini-2.5-flash";

  try {
    const response = await genAI.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
          { text: "Detect objects. Return JSON array with label and box_2d (ymin, xmin, ymax, xmax) 0-1000." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              }
            },
            required: ["label", "box_2d"]
          }
        }
      }
    });

    if (response.text) {
        const data = JSON.parse(response.text);
        return data as LiveDetection[];
    }
    return [];

  } catch (error) {
    // Fail silently for live loop
    return [];
  }
};

// AudioRecorder Component
// =======================
// A component for recording audio notes with visual feedback

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Convert audio blob to WAV format
 * Notion doesn't support webm, so we need to convert to WAV
 */
async function convertToWav(audioBlob: Blob): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Create WAV file
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  
  // Interleave channels
  const length = audioBuffer.length * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  
  // Write WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);
  
  // Write audio data
  const offset = 44;
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }
  
  let pos = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset + pos, intSample, true);
      pos += 2;
    }
  }
  
  await audioContext.close();
  return new Blob([buffer], { type: 'audio/wav' });
}

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onRecordingStart?: () => void;
  onRecordingCancel?: () => void;
  existingAudioUrls?: string[]; // Multiple audio recordings
  onDeleteAudio?: (index: number) => void; // Optional delete handler
  darkMode?: boolean;
  compact?: boolean;
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
}

export function AudioRecorder({
  onRecordingComplete,
  onRecordingStart,
  onRecordingCancel,
  existingAudioUrls = [],
  onDeleteAudio,
  darkMode = false,
  compact = false,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioLevel: 0,
  });
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const isRecordingRef = useRef(false);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  // Audio level visualization - use ref to avoid stale closure
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecordingRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedLevel = Math.min(average / 128, 1);
    
    setState(prev => ({ ...prev, audioLevel: normalizedLevel }));
    
    if (isRecordingRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, []);
  
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      streamRef.current = stream;
      
      // Set up audio analyzer for visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // Determine supported MIME type for recording
      // We'll convert to WAV before uploading since Notion doesn't support webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Convert to WAV format for Notion compatibility
        try {
          console.log('[AudioRecorder] Converting to WAV format...');
          const wavBlob = await convertToWav(audioBlob);
          console.log('[AudioRecorder] Converted to WAV:', wavBlob.size, 'bytes');
          onRecordingComplete(wavBlob, state.duration);
        } catch (err) {
          console.error('[AudioRecorder] Failed to convert to WAV:', err);
          // Fall back to original format
          onRecordingComplete(audioBlob, state.duration);
        }
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      
      isRecordingRef.current = true;
      setState({
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioLevel: 0,
      });
      
      // Start timer
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      
      // Start audio level visualization
      updateAudioLevel();
      
      onRecordingStart?.();
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Microphone access denied. Please allow microphone access to record audio notes.');
    }
  }, [onRecordingComplete, onRecordingStart, state.duration, updateAudioLevel]);
  
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
    }
  }, [state.isRecording]);
  
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      isRecordingRef.current = false;
      setState({ isRecording: false, isPaused: false, duration: 0, audioLevel: 0 });
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      
      onRecordingCancel?.();
    }
  }, [state.isRecording, onRecordingCancel]);
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const playAudio = useCallback((index: number) => {
    const url = existingAudioUrls[index];
    if (!url) return;
    
    // Stop any currently playing audio
    if (playingIndex !== null && audioRefs.current[playingIndex]) {
      audioRefs.current[playingIndex].pause();
    }
    
    if (!audioRefs.current[index]) {
      audioRefs.current[index] = new Audio(url);
      audioRefs.current[index].onended = () => setPlayingIndex(null);
    }
    
    if (playingIndex === index) {
      audioRefs.current[index].pause();
      setPlayingIndex(null);
    } else {
      audioRefs.current[index].play();
      setPlayingIndex(index);
    }
  }, [existingAudioUrls, playingIndex]);
  
  // Theme colors
  const colors = {
    primary: darkMode ? '#60a5fa' : '#3b82f6',
    primaryHover: darkMode ? '#93c5fd' : '#2563eb',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    text: darkMode ? '#e2e8f0' : '#334155',
    textSecondary: darkMode ? '#94a3b8' : '#64748b',
    bg: darkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)',
    border: darkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(226, 232, 240, 0.8)',
  };
  
  if (error) {
    return (
      <div style={{
        padding: compact ? '8px' : '12px',
        borderRadius: 8,
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: colors.danger,
        fontSize: compact ? 11 : 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{error}</span>
        <button
          onClick={() => setError(null)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: colors.danger,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>
    );
  }
  
  if (state.isRecording) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        padding: compact ? '8px 10px' : '10px 14px',
        borderRadius: 10,
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      }}>
        {/* Recording indicator with pulse */}
        <div style={{
          width: compact ? 10 : 12,
          height: compact ? 10 : 12,
          borderRadius: '50%',
          background: colors.danger,
          animation: 'pulse 1.5s infinite',
          boxShadow: `0 0 0 ${state.audioLevel * 8}px rgba(239, 68, 68, 0.2)`,
          transition: 'box-shadow 0.1s ease',
        }} />
        
        {/* Duration */}
        <span style={{
          fontFamily: 'monospace',
          fontSize: compact ? 12 : 14,
          fontWeight: 600,
          color: colors.danger,
          minWidth: 45,
        }}>
          {formatDuration(state.duration)}
        </span>
        
        {/* Audio level bars */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: compact ? 16 : 20 }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: `${Math.max(20, Math.min(100, state.audioLevel * 100 + i * 15))}%`,
                borderRadius: 2,
                background: colors.danger,
                opacity: state.audioLevel > i * 0.2 ? 0.8 : 0.3,
                transition: 'height 0.1s ease, opacity 0.1s ease',
              }}
            />
          ))}
        </div>
        
        {/* Stop button */}
        <button
          onClick={stopRecording}
          title="Stop and save"
          style={{
            marginLeft: 'auto',
            width: compact ? 28 : 32,
            height: compact ? 28 : 32,
            borderRadius: 6,
            border: 'none',
            background: colors.danger,
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = colors.dangerHover}
          onMouseLeave={(e) => e.currentTarget.style.background = colors.danger}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
        
        {/* Cancel button */}
        <button
          onClick={cancelRecording}
          title="Cancel recording"
          style={{
            width: compact ? 28 : 32,
            height: compact ? 28 : 32,
            borderRadius: 6,
            border: `1px solid ${colors.border}`,
            background: 'transparent',
            color: colors.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.danger;
            e.currentTarget.style.color = colors.danger;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.color = colors.textSecondary;
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8, flexWrap: 'wrap' }}>
      {/* Existing audio playback buttons - one for each recording */}
      {existingAudioUrls.map((_url, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => playAudio(index)}
            title={playingIndex === index ? 'Pause' : `Play audio note ${index + 1}`}
            style={{
              width: compact ? 26 : 30,
              height: compact ? 26 : 30,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: playingIndex === index ? colors.primary : 'transparent',
              color: playingIndex === index ? 'white' : colors.primary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              fontSize: compact ? 10 : 11,
              fontWeight: 500,
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (playingIndex !== index) {
                e.currentTarget.style.background = `${colors.primary}15`;
              }
            }}
            onMouseLeave={(e) => {
              if (playingIndex !== index) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {playingIndex === index ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 1 }}>
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                <span style={{ fontSize: 9 }}>{index + 1}</span>
              </>
            )}
          </button>
          {onDeleteAudio && (
            <button
              onClick={() => onDeleteAudio(index)}
              title={`Delete audio note ${index + 1}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                color: colors.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                opacity: 0.6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.danger;
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textSecondary;
                e.currentTarget.style.opacity = '0.6';
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      ))}
      
      {/* Record button */}
      <button
        onClick={startRecording}
        title="Record audio note"
        style={{
          width: compact ? 28 : 32,
          height: compact ? 28 : 32,
          borderRadius: 6,
          border: `1px solid ${colors.border}`,
          background: 'transparent',
          color: colors.danger,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          e.currentTarget.style.borderColor = colors.danger;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = colors.border;
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      
      {existingAudioUrls.length === 0 && !compact && (
        <span style={{ fontSize: 11, color: colors.textSecondary }}>
          Record voice note
        </span>
      )}
    </div>
  );
}

// Add pulse animation to document
if (typeof document !== 'undefined') {
  const styleId = 'audio-recorder-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.1); }
      }
    `;
    document.head.appendChild(style);
  }
}

export default AudioRecorder;

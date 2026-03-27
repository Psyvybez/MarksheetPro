import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

interface ScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
}

const ISBN_PATTERN = /^\d{10}$|^\d{13}$/;

export function Scanner({ onScan, onClose }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore cleanup errors
    }
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startScanner = async () => {
      // Small delay to allow layout to paint before requesting camera
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled || !videoRef.current) return;

      try {
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Prefer the rear (environment-facing) camera
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (ISBN_PATTERN.test(text) && text !== lastScanRef.current) {
                lastScanRef.current = text;
                stopScanner();
                onScan(text);
              }
            } else if (err && !(err instanceof NotFoundException)) {
              // NotFoundException just means "no barcode in frame yet" — normal
              console.debug('Scanner error:', err);
            }
          },
        );

        if (!cancelled) {
          controlsRef.current = controls;
          setIsReady(true);
        } else {
          controls.stop();
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            setCameraError('Camera permission was denied. Please allow camera access and try again.');
          } else if (msg.toLowerCase().includes('found') || msg.toLowerCase().includes('device')) {
            setCameraError('No camera found on this device.');
          } else {
            setCameraError(`Camera error: ${msg}`);
          }
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  return (
    <div className="scanner-overlay">
      <div className="scanner-header">
        <button className="scanner-close-btn" onClick={onClose} aria-label="Close scanner">
          ✕ Cancel
        </button>
        <h2 className="scanner-title">Scan ISBN Barcode</h2>
      </div>

      <div className="scanner-viewport">
        {cameraError ? (
          <div className="scanner-error-box">
            <span className="scanner-error-icon">📷</span>
            <p>{cameraError}</p>
            <button className="btn btn-secondary" onClick={onClose}>
              Go Back
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="scanner-video"
              autoPlay
              muted
              playsInline
            />
            <div className="scanner-frame">
              <div className="scanner-frame-corner tl" />
              <div className="scanner-frame-corner tr" />
              <div className="scanner-frame-corner bl" />
              <div className="scanner-frame-corner br" />
              {isReady && <div className="scanner-laser" />}
            </div>
            {!isReady && (
              <div className="scanner-loading">
                <div className="spinner" />
                <p>Starting camera…</p>
              </div>
            )}
          </>
        )}
      </div>

      <p className="scanner-hint">
        Point the camera at the barcode on the back of the book
      </p>
    </div>
  );
}

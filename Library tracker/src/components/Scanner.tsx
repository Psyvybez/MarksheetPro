import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

interface ScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
  mode?: 'add' | 'search';
}

const ISBN_PATTERN = /^\d{10}$|^\d{13}$/;

export function Scanner({ onScan, onClose, mode = 'add' }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore cleanup errors
    }
    controlsRef.current = null;
  }, []);

  const submitIsbn = useCallback(
    (rawValue: string) => {
      const normalized = rawValue.replace(/[^0-9X]/gi, '').toUpperCase();
      if (!ISBN_PATTERN.test(normalized)) {
        setManualError('Enter or scan a valid 10 or 13 digit ISBN.');
        return;
      }

      if (normalized === lastScanRef.current) return;

      lastScanRef.current = normalized;
      setManualError(null);
      stopScanner();
      onScan(normalized);
    },
    [onScan, stopScanner]
  );

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
          }
        );

        if (!cancelled) {
          controlsRef.current = controls;
          setIsReady(true);
        } else {
          controls.stop();
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      manualInputRef.current?.focus();
    }, 100);

    return () => window.clearTimeout(timer);
  }, []);

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
          </div>
        ) : (
          <>
            <video ref={videoRef} className="scanner-video" autoPlay muted playsInline />
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

      <form
        className="scanner-manual-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitIsbn(manualIsbn);
        }}
      >
        <label className="scanner-manual-label" htmlFor="scanner-isbn-input">
          Use handheld scanner or type ISBN {mode === 'search' ? 'to find a book' : 'to add a book'}
        </label>
        <div className="scanner-manual-row">
          <input
            id="scanner-isbn-input"
            ref={manualInputRef}
            className="scanner-manual-input"
            value={manualIsbn}
            onChange={(e) => {
              setManualIsbn(e.target.value);
              if (manualError) setManualError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Scan or enter ISBN, then press Enter"
            aria-label="Scan or enter ISBN"
          />
          <button type="submit" className="btn btn-secondary">
            Use ISBN
          </button>
        </div>
        {manualError && <p className="scanner-manual-error">{manualError}</p>}
      </form>

      <p className="scanner-hint">Point the camera at the barcode, or use a handheld scanner on desktop.</p>
    </div>
  );
}

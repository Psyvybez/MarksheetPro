import { useRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { StudentCard } from '../types';

interface DigitalCardViewerProps {
  card: StudentCard;
  onClose: () => void;
}

export function DigitalCardViewer({ card, onClose }: DigitalCardViewerProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Generate QR code on mount
  useEffect(() => {
    const generateQR = async () => {
      try {
        // Encode card information: card number and student name
        const qrData = `CARD|${card.cardNumber}|${card.studentName}`;
        const url = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 150,
        });
        setQrCodeUrl(url);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
      }
    };

    generateQR();
  }, [card.cardNumber, card.studentName]);

  const handlePrint = () => {
    if (!cardRef.current) return;

    // Create a new window for printing
    const printWindow = window.open('', '', 'width=900,height=600');
    if (!printWindow) {
      alert('Failed to open print window. Please check your popup settings.');
      return;
    }

    // Write the HTML to the new window
    const cardHTML = cardRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Library Card - ${card.studentName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            padding: 40px;
            background: white;
          }
          .print-container {
            max-width: 500px;
            margin: 0 auto;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${cardHTML}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const handleDownloadPNG = () => {
    if (!cardRef.current) return;

    // Create a canvas with the card element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      alert('Failed to create canvas. Please try another format.');
      return;
    }

    const width = 400;
    const height = 250;
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('LIBRARY CARD', width / 2, 30);

    ctx.font = 'bold 24px system-ui';
    ctx.fillText(card.studentName, width / 2, 80);

    ctx.font = '12px system-ui';
    ctx.fillText('Card Number', width / 2, 130);

    ctx.font = 'bold 28px monospace';
    ctx.fillText(card.cardNumber, width / 2, 180);

    ctx.font = '11px system-ui';
    ctx.fillText(card.isActive ? '✓ Active' : '✗ Inactive', width / 2, 220);

    // Draw QR code on canvas if available
    if (qrCodeUrl) {
      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.drawImage(qrImg, width - 110, 10, 100, 100);
        finalizePNGDownload(canvas);
      };
      qrImg.src = qrCodeUrl;
    } else {
      finalizePNGDownload(canvas);
    }
  };

  const finalizePNGDownload = (canvas: HTMLCanvasElement) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Failed to create image. Please try again.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${card.studentName.replace(/\s+/g, '_')}_${card.cardNumber}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  const handleDownloadSVG = () => {
    let qrCodeElement = '';
    if (qrCodeUrl) {
      qrCodeElement = `<image href="${qrCodeUrl}" x="300" y="10" width="100" height="100" />`;
    }

    const svgContent = `
      <svg width="400" height="250" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="400" height="250" rx="12" fill="url(#cardGradient)"/>
        <text x="200" y="30" font-size="14" font-weight="bold" fill="white" text-anchor="middle">LIBRARY CARD</text>
        <text x="200" y="80" font-size="24" font-weight="bold" fill="white" text-anchor="middle">${card.studentName}</text>
        <text x="200" y="130" font-size="12" fill="white" text-anchor="middle">Card Number</text>
        <text x="200" y="180" font-size="28" font-weight="bold" fill="white" text-anchor="middle" font-family="monospace">${card.cardNumber}</text>
        <text x="200" y="220" font-size="11" fill="white" text-anchor="middle">${card.isActive ? '✓ Active' : '✗ Inactive'}</text>
        ${qrCodeElement}
      </svg>
    `;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${card.studentName.replace(/\s+/g, '_')}_${card.cardNumber}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Digital library card">
      <div className="modal-sheet" style={{ maxWidth: '500px' }}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2 className="modal-title">Digital Library Card</h2>

        {/* Card Display */}
        <div
          ref={cardRef}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '12px',
            padding: '24px',
            color: 'white',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textAlign: 'center',
            marginBottom: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          {/* QR Code - Top Right */}
          {qrCodeUrl && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'white',
                padding: '6px',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              <img
                src={qrCodeUrl}
                alt="Card QR Code"
                style={{
                  width: '100px',
                  height: '100px',
                  display: 'block',
                }}
              />
            </div>
          )}

          {/* Card Header */}
          <div>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '12px', fontWeight: '600' }}>LIBRARY CARD</div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: '700' }}>{card.studentName}</h3>
          </div>

          {/* Card Number */}
          <div>
            <div style={{ fontSize: '12px', opacity: 0.85, marginBottom: '8px' }}>Card Number</div>
            <div style={{ fontSize: '28px', fontWeight: '700', fontFamily: 'Monaco, monospace', letterSpacing: '2px' }}>
              {card.cardNumber}
            </div>
          </div>

          {/* Card Footer */}
          <div
            style={{
              fontSize: '11px',
              opacity: 0.8,
              marginTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.3)',
              paddingTop: '12px',
            }}
          >
            {card.isActive ? '✓ Active' : '✗ Inactive'}
          </div>
        </div>

        {/* Card Details */}
        <div style={{ marginBottom: '20px', backgroundColor: '#f3f4f6', padding: '12px', borderRadius: '8px' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontWeight: '600', color: '#374151' }}>Student Name:</span>
            <span style={{ marginLeft: '8px', color: '#6b7280' }}>{card.studentName}</span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontWeight: '600', color: '#374151' }}>Card Number:</span>
            <span style={{ marginLeft: '8px', color: '#6b7280', fontFamily: 'Monaco, monospace' }}>
              {card.cardNumber}
            </span>
          </div>
          <div style={{ marginBottom: '0' }}>
            <span style={{ fontWeight: '600', color: '#374151' }}>Status:</span>
            <span
              style={{
                marginLeft: '8px',
                color: card.isActive ? '#16a34a' : '#dc2626',
                fontWeight: '600',
              }}
            >
              {card.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {card.notes && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontWeight: '600', color: '#374151' }}>Notes:</span>
              <span style={{ marginLeft: '8px', color: '#6b7280' }}>{card.notes}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="checkout-form-btns" style={{ gap: '8px', flexDirection: 'column' }}>
          <button type="button" className="btn btn-primary" onClick={handlePrint} style={{ width: '100%' }}>
            🖨️ Print Card
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleDownloadSVG} style={{ width: '100%' }}>
            💾 Download SVG
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleDownloadPNG} style={{ width: '100%' }}>
            📥 Download PNG
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

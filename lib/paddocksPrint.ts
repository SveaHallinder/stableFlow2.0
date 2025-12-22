import type { Paddock } from '@/context/AppDataContext';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toDataUri(image: Paddock['image']) {
  if (!image) {
    return undefined;
  }

  if (image.base64) {
    const mimeType = image.mimeType?.trim() || 'image/jpeg';
    return `data:${mimeType};base64,${image.base64}`;
  }

  if (image.uri && /^https?:\/\//i.test(image.uri)) {
    return image.uri;
  }

  return undefined;
}

export function createPaddocksPrintHtml(paddocks: Paddock[]) {
  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const sorted = [...paddocks].sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'));
  const content = sorted
    .map((paddock) => {
      const imageSrc = toDataUri(paddock.image);
      const season =
        paddock.season === 'summer'
          ? 'Sommarhage'
          : paddock.season === 'winter'
            ? 'Vinterhage'
            : 'Året runt';
      const horses =
        paddock.horseNames.length > 0
          ? paddock.horseNames
              .map((name) => `<li>${escapeHtml(name)}</li>`)
              .join('')
          : '<li class="muted">Inga hästar angivna</li>';

      return `
        <section class="paddock">
          <header class="paddockHeader">
            <h2 class="paddockTitle">${escapeHtml(paddock.name)}</h2>
            <div class="paddockMeta">${paddock.horseNames.length} hästar · ${season}</div>
          </header>
          ${
            imageSrc
              ? `<img class="paddockImage" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(
                  paddock.name,
                )}" />`
              : `<div class="paddockImagePlaceholder" aria-hidden="true">Ingen bild</div>`
          }
          <div class="paddockBody">
            <div class="label">Hästar</div>
            <ul class="horseList">
              ${horses}
            </ul>
          </div>
        </section>
      `.trim();
    })
    .join('\n');

  return `
  <!doctype html>
  <html lang="sv">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Hagar</title>
      <style>
        :root {
          --bg: #ffffff;
          --text: #121826;
          --muted: #667085;
          --border: #e6e8ef;
        }

        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          background: var(--bg);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }

        .generated {
          color: var(--muted);
          font-size: 12px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .paddock {
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          break-inside: avoid;
        }

        .paddockHeader {
          padding: 14px 14px 10px 14px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }

        .paddockTitle {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }

        .paddockMeta {
          color: var(--muted);
          font-size: 12px;
          white-space: nowrap;
        }

        .paddockImage {
          width: 100%;
          height: 160px;
          object-fit: cover;
          display: block;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }

        .paddockImagePlaceholder {
          width: 100%;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }

        .paddockBody {
          padding: 12px 14px 16px 14px;
        }

        .label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .horseList {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
          font-size: 13px;
        }

        .horseList .muted {
          color: var(--muted);
          list-style: none;
          padding-left: 0;
          margin-left: -18px;
        }

        @media print {
          body {
            padding: 14mm;
          }

          .grid {
            gap: 10px;
          }

          .paddock {
            border-color: #d7d9e0;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Hagar & hästar</h1>
        <div class="generated">Utskrift: ${escapeHtml(generatedLabel)}</div>
      </div>
      <main class="grid">
        ${content}
      </main>
    </body>
  </html>
  `.trim();
}

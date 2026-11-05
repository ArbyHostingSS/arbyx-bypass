const ALLOWED_HOSTS = ["sfl.gl"];
const MAX_REDIRECTS = 5;

function getMetaRefresh(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const equiv = tag.match(
      /http-equiv\s*=\s*["']?refresh["']?/i
    );

    if (!equiv) continue;

    const content = tag.match(
      /content\s*=\s*["']([^"']+)["']/i
    );

    if (!content) continue;

    const match = content[1].match(
      /^\s*\d+\s*;\s*url\s*=\s*["']?([^"']+)["']?\s*$/i
    );

    if (match) return match[1].trim();
  }

  return null;
}

function validUrl(value, base) {
  try {
    const url = new URL(value, base);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (url.username || url.password) return null;

    return url;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method tidak diizinkan"
    });
  }

  let current = validUrl(req.query.url);

  if (!current) {
    return res.status(400).json({
      success: false,
      message: "URL tidak valid"
    });
  }

  if (!ALLOWED_HOSTS.includes(current.hostname)) {
    return res.status(403).json({
      success: false,
      message: "Domain belum didukung"
    });
  }

  try {
    for (let i = 0; i < MAX_REDIRECTS; i++) {
      if (!ALLOWED_HOSTS.includes(current.hostname)) {
        return res.status(200).json({
          success: true,
          destination: current.href,
          method: "redirect"
        });
      }

      const response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "ArbyX-Resolver/3.0",
          "Accept": "text/html"
        },
        signal: AbortSignal.timeout(8000)
      });

      const status = response.status;
      const location = response.headers.get("location");

      // LOGGING UNTUK DEBUGGING
      console.log("[ArbyX] Upstream response:", {
        hostname: current.hostname,
        status: status,
        location: location,
        contentType: response.headers.get("content-type")
      });

      if ([301, 302, 303, 307, 308].includes(status)) {
        await response.body?.cancel();

        if (!location) {
          throw new Error("Header redirect tidak memiliki tujuan");
        }

        const next = validUrl(location, current);

        if (!next) {
          throw new Error("Tujuan redirect tidak valid");
        }

        current = next;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();

        throw new Error(
          "Server shortlink merespons HTTP " + status
        );
      }

      const type = response.headers.get("content-type") || "";

      if (!type.includes("text/html")) {
        await response.body?.cancel();

        throw new Error("Halaman bukan HTML");
      }

      const html = (await response.text()).slice(0, 200000);
      const metaUrl = getMetaRefresh(html);

      if (metaUrl) {
        const next = validUrl(metaUrl, current);

        if (!next) {
          throw new Error("Meta Refresh tidak valid");
        }

        if (ALLOWED_HOSTS.includes(next.hostname)) {
          current = next;
          continue;
        }

        return res.status(200).json({
          success: true,
          destination: next.href,
          method: "meta-refresh"
        });
      }

      return res.status(200).json({
        success: false,
        message: "Halaman perantara ditemukan. Redirect JavaScript atau verifikasi mungkin diperlukan."
      });
    }

    return res.status(200).json({
      success: false,
      message: "Batas redirect tercapai"
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      message: error.message || "Gagal memproses link"
    });
  }
}

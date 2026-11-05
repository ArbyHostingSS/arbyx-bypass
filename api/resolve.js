const ALLOWED_HOSTS = ["sfl.gl"];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method tidak diizinkan"
    });
  }

  let current;

  try {
    current = new URL(req.query.url);
  } catch {
    return res.status(400).json({
      success: false,
      message: "URL tidak valid"
    });
  }

  if (!["http:", "https:"].includes(current.protocol)) {
    return res.status(400).json({
      success: false,
      message: "Protokol tidak didukung"
    });
  }

  if (!ALLOWED_HOSTS.includes(current.hostname)) {
    return res.status(403).json({
      success: false,
      message: "Domain belum didukung"
    });
  }

  try {
    for (let i = 0; i < 5; i++) {
      const response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "Range": "bytes=0-0",
          "User-Agent": "ArbyX-Link-Resolver/1.0"
        },
        signal: AbortSignal.timeout(8000)
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();

        return res.status(200).json({
          success: false,
          message: "Redirect HTTP tidak ditemukan"
        });
      }

      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location) break;

      const next = new URL(location, current);

      if (!["http:", "https:"].includes(next.protocol)) break;

      if (!ALLOWED_HOSTS.includes(next.hostname)) {
        return res.status(200).json({
          success: true,
          destination: next.href
        });
      }

      current = next;
    }

    return res.status(200).json({
      success: false,
      message: "Batas redirect tercapai"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Gagal memproses redirect"
    });
  }
}

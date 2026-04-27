import axios, { AxiosError } from "axios";
import type { VisaAppointment } from "../types";
import { config } from "../config/environment";

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = config.api.maxRetries
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof AxiosError &&
      error.response &&
      typeof error.response.status === "number" &&
      error.response.status >= 500
    ) {
      console.log(`Yeniden deneniyor... ${config.api.maxRetries - retries + 1}/${config.api.maxRetries}`);
      await new Promise((resolve) =>
        setTimeout(resolve, config.api.retryDelayBase * (config.api.maxRetries - retries + 1))
      );
      return fetchWithRetry(fn, retries - 1);
    }
    throw error;
  }
}

export async function fetchAppointments(): Promise<VisaAppointment[]> {
  try {
    const token = process.env.VFS_TOKEN || "";
    const missionCodes = (process.env.MISSION_COUNTRY || "nld").split(",");
    const countryCode = process.env.TARGET_COUNTRY || "tur";
    const centerCode = "TRNL";

    const results: VisaAppointment[] = [];

    for (const missionCode of missionCodes) {
      try {
        const response = await fetchWithRetry(() =>
          axios.get(config.api.visaApiUrl, {
            params: {
              countryCode,
              missionCode: missionCode.trim(),
              centerCode,
              languageCode: "en-US",
              days: "90",
            },
            headers: {
              authorize: token,
              accept: "application/json, text/plain, */*",
              origin: "https://visa.vfsglobal.com",
              referer: "https://visa.vfsglobal.com/",
              route: `${countryCode}/tr/${missionCode.trim()}`,
            },
          })
        );

        console.log(`[${missionCode.toUpperCase()}] API yanıtı:`, JSON.stringify(response.data).substring(0, 200));

        if (response.data && Array.isArray(response.data)) {
          const mapped = response.data.map((slot: any) => ({
            center: slot.centerName || slot.center || `VFS ${missionCode.toUpperCase()} Istanbul`,
            mission_code: missionCode.trim(),
            country_code: countryCode,
            visa_type: slot.visaCategory || slot.visa_type || "Tourism",
            status: "open",
            last_date: slot.date || slot.slotDate || new Date().toISOString(),
          }));
          results.push(...mapped);
        }
      } catch (err) {
        if (err instanceof AxiosError) {
          console.error(`[${missionCode.toUpperCase()}] API Hatası:`, {
            durum: err.response?.status,
            mesaj: err.message,
            data: JSON.stringify(err.response?.data).substring(0, 200),
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Genel hata:", error);
    return [];
  }
}

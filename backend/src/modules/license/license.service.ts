import {
    createPublicKey,
    verify,
  } from "node:crypto";
  import { readFile } from "node:fs/promises";
  import { env } from "../../config/env.js";
  
  export interface LicensePayload {
    licenseId: string;
    customer: string;
    installationId: string;
    issuedAt: string;
    expiresAt: string;
    features: string[];
  }
  
  interface LicenseDocument {
    payload: LicensePayload;
    signature: string;
  }
  
  export interface LicenseValidationResult {
    valid: boolean;
    reason?: string;
    payload?: LicensePayload;
  }
  
  function isLicenseDocument(value: unknown): value is LicenseDocument {
    if (!value || typeof value !== "object") {
      return false;
    }
  
    const document = value as Partial<LicenseDocument>;
    const payload = document.payload as Partial<LicensePayload> | undefined;
  
    return (
      typeof document.signature === "string" &&
      !!payload &&
      typeof payload.licenseId === "string" &&
      typeof payload.customer === "string" &&
      typeof payload.installationId === "string" &&
      typeof payload.issuedAt === "string" &&
      typeof payload.expiresAt === "string" &&
      Array.isArray(payload.features)
    );
  }
  
  export async function validateLicense(): Promise<LicenseValidationResult> {
    if (!env.licenseEnabled) {
      return {
        valid: true,
        reason: "Lisans kontrolü devre dışı.",
      };
    }
  
    try {
      const [
        licenseJson,
        publicKeyPem,
        installationIdText,
      ] = await Promise.all([
        readFile(env.licenseFilePath, "utf8"),
        readFile(env.licensePublicKeyPath, "utf8"),
        readFile(env.installationIdPath, "utf8"),
      ]);
  
      const parsed: unknown = JSON.parse(licenseJson);
  
      if (!isLicenseDocument(parsed)) {
        return {
          valid: false,
          reason: "Lisans dosyasının biçimi geçersiz.",
        };
      }
  
      const installationId = installationIdText.trim();
  
      if (!installationId) {
        return {
          valid: false,
          reason: "Kurulum kimliği boş.",
        };
      }
  
      if (parsed.payload.installationId !== installationId) {
        return {
          valid: false,
          reason: "Lisans bu kuruluma ait değil.",
        };
      }
  
      const serializedPayload = JSON.stringify(parsed.payload);
      const publicKey = createPublicKey(publicKeyPem);
  
      const signatureValid = verify(
        null,
        Buffer.from(serializedPayload, "utf8"),
        publicKey,
        Buffer.from(parsed.signature, "base64")
      );
  
      if (!signatureValid) {
        return {
          valid: false,
          reason: "Lisans imzası geçersiz veya dosya değiştirilmiş.",
        };
      }
  
      const issuedAt = new Date(parsed.payload.issuedAt);
      const expiresAt = new Date(parsed.payload.expiresAt);
      const now = new Date();
  
      if (
        Number.isNaN(issuedAt.getTime()) ||
        Number.isNaN(expiresAt.getTime())
      ) {
        return {
          valid: false,
          reason: "Lisans tarihleri geçersiz.",
        };
      }
  
      if (issuedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
        return {
          valid: false,
          reason: "Lisans başlangıç tarihi henüz gelmemiş.",
        };
      }
  
      if (expiresAt.getTime() <= now.getTime()) {
        return {
          valid: false,
          reason: "Lisansın süresi dolmuş.",
          payload: parsed.payload,
        };
      }
  
      return {
        valid: true,
        payload: parsed.payload,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Bilinmeyen lisans doğrulama hatası.";
  
      return {
        valid: false,
        reason: `Lisans doğrulanamadı: ${reason}`,
      };
    }
  }
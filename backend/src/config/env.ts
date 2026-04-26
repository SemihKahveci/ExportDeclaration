import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/export_declaration",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads"
};

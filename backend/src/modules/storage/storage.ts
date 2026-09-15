import { env } from "../../config/env.js";
import { LocalFileStorage } from "./localFileStorage.js";

export const storage = new LocalFileStorage(env.uploadDir);

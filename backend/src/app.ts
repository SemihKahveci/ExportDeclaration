import cors from "cors";
import express, { type Request, type Response } from "express";
import { authContextMiddleware } from "./common/middlewares/authContext.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { declarationRouter } from "./modules/declarations/declaration.routes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/declarations", authContextMiddleware, declarationRouter);

app.use(errorHandler);

export default app;

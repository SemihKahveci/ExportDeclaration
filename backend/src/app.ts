import cors from "cors";
import express, { type Request, type Response } from "express";
import { authContextMiddleware } from "./common/middlewares/authContext.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { buildCorsOptions } from "./config/corsOptions.js";
import { env } from "./config/env.js";
import { declarationRouter } from "./modules/declarations/declaration.routes.js";
import { gtipQueryRouter } from "./modules/gtip-query/gtipQuery.routes.js";
import { userRouter } from "./modules/users/user.routes.js";

const app = express();

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: env.jsonBodyLimit }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/declarations", authContextMiddleware, declarationRouter);
app.use("/api/gtip-query", authContextMiddleware, gtipQueryRouter);
app.use("/api/users", authContextMiddleware, userRouter);

app.use(errorHandler);

export default app;

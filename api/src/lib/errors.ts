export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export type AsyncHandler = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => Promise<unknown>;

export const wrap =
  (fn: AsyncHandler) =>
  (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    fn(req, res, next).catch(next);
  };
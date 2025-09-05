import { Request, Response } from "express";
import prisma from "../../config/db";
import { hashPassword, comparePassword } from "../../utils/hash";
import { generateTokens, verifyRefreshToken } from "../../utils/jwt";

export const register = async (req: Request, res: Response) => {
  const { email, password, role } = req.body;
  const hashed = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, password: hashed, role },
  });

  res.json(user);
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const match = await comparePassword(password, user.password);
  if (!match) return res.status(401).json({ message: "Invalid credentials" });

  const tokens = generateTokens(user);
  res.json({ user, ...tokens });
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user)
      return res.status(401).json({ message: "Invalid refresh token" });

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (e) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
};

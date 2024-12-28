import { PrismaClient } from '@prisma/client'
import dotenv from "dotenv";

dotenv.config()

export const db_client = new PrismaClient({ log: ['query', 'info', 'warn', 'error']})
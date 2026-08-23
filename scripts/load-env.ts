// Next.js loads .env.local automatically, but these scripts run under plain
// Node through tsx, where `dotenv/config` reads only .env. Load the same files
// Next would, in the same precedence order:
//
//   real environment  >  .env.local  >  .env
//
// dotenv never overwrites a variable that is already set, so importing in this
// order gives .env.local priority while leaving CI and Vercel — where the
// environment is already populated — untouched.
//
// Import this first, before any module that reads process.env at load time.
import { config } from "dotenv";
import path from "node:path";

const root = process.cwd();
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

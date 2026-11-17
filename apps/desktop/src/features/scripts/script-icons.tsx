import type { ScriptIcon } from "@githydra/contracts";
import {
  Bug,
  Eraser,
  GitBranch,
  Hammer,
  type LucideIcon,
  Package,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";

export const SCRIPT_ICON: Record<ScriptIcon, LucideIcon> = {
  eraser: Eraser,
  play: Play,
  terminal: Terminal,
  "git-branch": GitBranch,
  package: Package,
  bug: Bug,
  hammer: Hammer,
  "refresh-cw": RefreshCw,
  search: Search,
  sparkles: Sparkles,
};

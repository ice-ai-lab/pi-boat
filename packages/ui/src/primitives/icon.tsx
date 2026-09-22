import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Copy,
  Database,
  File,
  Folder,
  Gauge,
  GitBranch,
  Image as ImageIcon,
  Lightbulb,
  List,
  Moon,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  SquareTerminal,
  Sun,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';

/**
 * 图标（docs/06 §6 对账表）：原型的 SVG sprite（31 个 `#i-*`）逐一对到 lucide。
 * 仅品牌图标 `i-boat` 自留 SVG（lucide 无 Boat）。
 */
const ICONS = {
  panel: PanelLeft,
  plus: Plus,
  search: Search,
  folder: Folder,
  file: File,
  'chev-r': ChevronRight,
  'chev-d': ChevronDown,
  branch: GitBranch,
  book: BookOpen,
  wrench: Wrench,
  gauge: Gauge,
  db: Database,
  coin: CircleDollarSign,
  send: ArrowUp,
  stop: Square,
  img: ImageIcon,
  gear: Settings,
  moon: Moon,
  sun: Sun,
  refresh: RefreshCw,
  term: SquareTerminal,
  pencil: Pencil,
  trash: Trash2,
  check: Check,
  copy: Copy,
  bulb: Lightbulb,
  spark: Sparkles,
  upload: Upload,
  list: List,
  clock: Clock,
  warn: AlertTriangle,
} as const;

export type IconName = keyof typeof ICONS | 'boat';

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** 图标按钮自带 title 时可关掉（默认 aria-hidden） */
  title?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, title }: IconProps) {
  if (name === 'boat') return <BoatMark size={size} className={className} title={title} />;
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={title === undefined}
      {...(title === undefined ? {} : { role: 'img', 'aria-label': title })}
    />
  );
}

/** 品牌帆船标记（原型 `#i-boat`；lucide 无对应图标，自留） */
export function BoatMark({
  size = 20,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const paths = (
    <>
      <path d="M3 15h18l-2.5 4.2a2 2 0 0 1-1.7 1H7.2a2 2 0 0 1-1.7-1L3 15Z" />
      <path d="M12 15V4l6 8" />
      <path d="M12 8 7 13" />
    </>
  );
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  // 有 title = 语义图标（给可读名）；无 title = 装饰图标（对 AT 隐藏）
  if (title === undefined) {
    return (
      <svg {...common} aria-hidden="true">
        {paths}
      </svg>
    );
  }
  return (
    <svg {...common} role="img" aria-label={title}>
      <title>{title}</title>
      {paths}
    </svg>
  );
}

import React from "react";
import { View } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  PlusCircle,
  X,
  XCircle,
  Check,
  CheckCircle,
  Circle,
  Search,
  SlidersHorizontal,
  Bell,
  BellDot,
  BellRing,
  MessageCircle,
  MessagesSquare,
  Send,
  MoreHorizontal,
  Heart,
  Bookmark,
  Share,
  Camera,
  Image as ImageIcon,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneIncoming,
  Volume1,
  Volume2,
  VolumeOff,
  RefreshCcw,
  Calendar,
  Clock,
  MapPin,
  Map,
  Globe,
  Ticket,
  Sparkles,
  Users,
  UserCircle,
  User,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  Grid3X3,
  Layers,
  ArrowUp,
  ArrowUpCircle,
  ArrowUpRight,
  SquarePen,
  QrCode,
  AlertTriangle,
  LogOut,
  Building2,
  Megaphone,
  Eye,
  EyeOff,
  Star,
  Lock,
  KeyRound,
  CreditCard,
  Trash2,
  Flag,
  Ban,
  FileText,
  HelpCircle,
  Info,
  Mail,
  Pencil,
  PencilLine,
  UserPlus,
  UserMinus,
  Play,
  Pause,
  Hand,
  Images,
  FileSearch,
  Crown,
  CircleAlert,
  Handshake,
  ChartBar,
  Link2,
  Tag,
  Pin,
  CalendarPlus,
  type LucideProps,
} from "lucide-react-native";

// Map SF Symbol names to Lucide icons
const iconMap: Record<string, React.FC<LucideProps>> = {
  // Navigation
  "chevron.left": ChevronLeft,
  "chevron.right": ChevronRight,
  "chevron.down": ChevronDown,
  "chevron.up": ChevronUp,
  "arrow.up": ArrowUp,
  "arrow.up.circle.fill": ArrowUpCircle,
  "arrow.up.right": ArrowUpRight,

  // Actions
  plus: Plus,
  "plus.circle.fill": PlusCircle,
  xmark: X,
  "xmark.circle.fill": XCircle,
  checkmark: Check,
  "checkmark.circle.fill": CheckCircle,
  circle: Circle,
  ellipsis: MoreHorizontal,
  "square.and.arrow.up": Share,
  "square.and.pencil": SquarePen,
  "rectangle.portrait.and.arrow.right": LogOut,

  // Search & Filter
  magnifyingglass: Search,
  "slider.horizontal.3": SlidersHorizontal,
  "line.3.horizontal.decrease": SlidersHorizontal,

  // Communication
  bell: Bell,
  "bell.fill": BellRing,
  "bell.badge": BellDot,
  "bubble.right": MessageCircle,
  "bubble.left.and.bubble.right": MessagesSquare,
  paperplane: Send,
  "paperplane.fill": Send,
  mic: Mic,
  "mic.fill": Mic,
  "mic.slash": MicOff,
  "mic.slash.fill": MicOff,
  phone: Phone,
  "phone.fill": Phone,
  "phone.down.fill": PhoneOff,
  "phone.arrow.down.left": PhoneIncoming,
  "phone.connection": PhoneCall,

  // Content
  heart: Heart,
  "heart.fill": Heart,
  bookmark: Bookmark,
  "bookmark.fill": Bookmark,
  "text.quote": FileText,
  "megaphone.fill": Megaphone,
  star: Star,
  "star.fill": Star,
  flag: Flag,
  "flag.fill": Flag,

  // Media
  camera: Camera,
  "camera.fill": Camera,
  "camera.rotate": RefreshCcw,
  "camera.rotate.fill": RefreshCcw,
  "arrow.triangle.2.circlepath": RefreshCcw,
  "arrow.counterclockwise": RefreshCcw,
  photo: ImageIcon,
  "photo.fill": ImageIcon,
  "photo.on.rectangle.angled": ImageIcon,
  "photo.on.rectangle": ImageIcon,
  "photo.badge.plus": Images,
  "photo.stack": Images,
  video: Video,
  "video.fill": Video,
  film: Video,
  "video.slash": VideoOff,
  "video.slash.fill": VideoOff,
  "play.rectangle": Play,
  "play.fill": Play,
  "pause.fill": Pause,
  qrcode: QrCode,
  "square.grid.3x3": Grid3X3,
  "rectangle.grid.3x2": Grid3X3,

  // People
  "person.circle": UserCircle,
  "person.circle.fill": UserCircle,
  "person.2": Users,
  "person.2.fill": Users,
  "person.2.slash": UserMinus,
  "person.3": Users,
  "person.3.fill": Users,
  person: User,
  "person.fill": User,
  "person.badge.plus": UserPlus,
  "person.badge.minus": UserMinus,
  "person.badge.shield.checkmark": ShieldCheck,

  // Places & Time
  calendar: Calendar,
  clock: Clock,
  mappin: MapPin,
  "mappin.and.ellipse": MapPin,
  "mappin.circle": MapPin,
  "mappin.circle.fill": MapPin,
  "location.fill": MapPin,
  map: Map,
  globe: Globe,
  ticket: Ticket,
  sparkles: Sparkles,

  // Settings & Security
  gearshape: Settings,
  "gearshape.2": Settings2,
  "shield.checkered": Shield,
  "shield.lefthalf.filled": Shield,
  "lock.shield": Lock,
  lock: Lock,
  "lock.fill": Lock,
  key: KeyRound,
  "key.fill": KeyRound,
  "checkmark.shield": ShieldCheck,
  eye: Eye,
  "eye.slash": EyeOff,
  "hand.raised": Hand,
  "hand.raised.fill": Hand,
  "hand.draw": Hand,
  "speaker.fill": Volume1,
  "speaker.wave.1.fill": Volume1,
  "speaker.wave.2.fill": Volume2,
  "speaker.wave.3.fill": Volume2,
  "speaker.slash": VolumeOff,
  "speaker.slash.fill": VolumeOff,

  // Buildings
  "building.2": Building2,
  "building.2.fill": Building2,

  // Misc
  "rectangle.stack": Layers,
  "rectangle.stack.fill": Layers,
  creditcard: CreditCard,
  trash: Trash2,
  "trash.fill": Trash2,
  nosign: Ban,
  "doc.text": FileText,
  "doc.plaintext": FileText,
  "doc.text.magnifyingglass": FileSearch,
  "questionmark.circle": HelpCircle,
  "info.circle": Info,
  "exclamationmark.triangle.fill": AlertTriangle,
  "exclamationmark.triangle": AlertTriangle,
  "exclamationmark.circle.fill": CircleAlert,
  "exclamationmark.circle": CircleAlert,
  "exclamationmark": CircleAlert,
  envelope: Mail,
  pencil: Pencil,
  "pencil.circle": PencilLine,
  crown: Crown,
  "crown.fill": Crown,
  handshake: Handshake,
  "hands.sparkles": Handshake,
  "handshake.fill": Handshake,
  link: Link2,
  "link.circle": Link2,
  tag: Tag,
  "tag.fill": Tag,
  "pin.fill": Pin,
  pin: Pin,
  "video.badge.waveform": Video,
  "bubble.left.fill": MessageCircle,
  "bubble.left.and.bubble.right.fill": MessagesSquare,

  // Charts
  "chart.bar": ChartBar,
  "chart.bar.fill": ChartBar,

  // Calendar
  "calendar.badge.plus": CalendarPlus,

  // Previously-unmapped (rendered as broken "?") — now mapped
  "person.crop.circle.badge.xmark": UserMinus,
  "arrow.down.doc": FileText,
  "party.popper": Sparkles,
};

interface SymbolViewProps {
  name: string;
  size?: number;
  tintColor?: string;
  weight?: "ultraLight" | "thin" | "light" | "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  style?: object;
}

export function SymbolView({
  name,
  size = 20,
  tintColor = "#000000",
  weight,
  style,
}: SymbolViewProps) {
  const LucideIcon = iconMap[name];

  // Fallback: render a visible circle with a question mark instead of empty
  if (!LucideIcon) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tintColor + "20",
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <HelpCircle size={size * 0.7} color={tintColor} strokeWidth={1.5} />
      </View>
    );
  }

  const isFilled = name.includes(".fill");
  let strokeWidth = 1.8;
  if (weight === "bold" || weight === "heavy" || weight === "black") {
    strokeWidth = 2.5;
  } else if (weight === "semibold" || weight === "medium") {
    strokeWidth = 2.2;
  } else if (weight === "light" || weight === "thin" || weight === "ultraLight") {
    strokeWidth = 1.2;
  }

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <LucideIcon
        size={size * 0.9}
        color={tintColor}
        strokeWidth={strokeWidth}
        fill={isFilled ? tintColor : "none"}
      />
    </View>
  );
}

export default SymbolView;
export { SymbolView as Icon };

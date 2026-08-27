import {
  Pill,
  Tablets,
  Syringe,
  FlaskConical,
  Droplets,
  Wind,
  Pipette,
  Package,
  type LucideIcon,
} from "lucide-react"

type MedicineType =
  | "tablet"
  | "capsule"
  | "syrup"
  | "injection"
  | "drops"
  | "inhaler"
  | "cream"
  | "other"

interface IconConfig {
  icon: LucideIcon
  color: string
  bg: string
}

const iconMap: Record<MedicineType, IconConfig> = {
  tablet:    { icon: Pill,          color: "text-blue-400",    bg: "bg-blue-500/10" },
  capsule:   { icon: Tablets,       color: "text-amber-400",   bg: "bg-amber-500/10" },
  syrup:     { icon: FlaskConical,  color: "text-purple-400",  bg: "bg-purple-500/10" },
  injection: { icon: Syringe,       color: "text-rose-400",    bg: "bg-rose-500/10" },
  drops:     { icon: Droplets,      color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  inhaler:   { icon: Wind,          color: "text-teal-400",    bg: "bg-teal-500/10" },
  cream:     { icon: Pipette,       color: "text-pink-400",    bg: "bg-pink-500/10" },
  other:     { icon: Package,       color: "text-slate-400",   bg: "bg-slate-500/10" },
}

const keywords: [MedicineType, RegExp][] = [
  ["tablet",    /tablet|tab\b|strip/i],
  ["capsule",   /capsule|caps\b|softgel/i],
  ["syrup",     /syrup|suspension|liquid|solution|oral\s*sol|tonic|elixir/i],
  ["injection", /injection|inj\b|vial|ampoule|ampule|iv\b|im\b/i],
  ["drops",     /drop|ear\s*drop|eye\s*drop|nasal/i],
  ["inhaler",   /inhaler|respule|nebuli|rotacap|puff/i],
  ["cream",     /cream|ointment|gel\b|lotion|paste|topical|tube/i],
]

/** Detect medicine type from product fields */
export function detectMedicineType(product: {
  name?: string
  pack_size?: string | null
  description?: string | null
  generic_name?: string | null
}): MedicineType {
  const searchText = [
    product.pack_size,
    product.name,
    product.generic_name,
    product.description,
  ]
    .filter(Boolean)
    .join(" ")

  for (const [type, pattern] of keywords) {
    if (pattern.test(searchText)) return type
  }
  return "other"
}

/** Get the icon config for a product */
export function getMedicineIconConfig(product: {
  name?: string
  pack_size?: string | null
  description?: string | null
  generic_name?: string | null
}): IconConfig {
  return iconMap[detectMedicineType(product)]
}

/** Render a medicine type icon for a product */
export function MedicineIcon({
  product,
  size = 20,
  className = "",
}: {
  product: {
    name?: string
    pack_size?: string | null
    description?: string | null
    generic_name?: string | null
  }
  size?: number
  className?: string
}) {
  const config = getMedicineIconConfig(product)
  const Icon = config.icon
  return <Icon size={size} className={`${config.color} ${className}`} />
}

import { cn } from "@/lib/utils"

const TOOTH_PATH =
  "M12 3.4C11.2 4.2 10.6 4.5 9.6 4.5C7.9 4.5 6.6 5.7 6.1 7.6C5.5 9.7 5.4 11.6 5.8 13.7C6.3 16.2 6.9 18.2 7.5 19.9C7.9 21.1 9.5 21.1 10 19.9C10.6 18.4 10.9 17.1 11.3 16.1C11.5 15.6 11.7 15.3 12 15.3C12.3 15.3 12.5 15.6 12.7 16.1C13.1 17.1 13.4 18.4 14 19.9C14.5 21.1 16.1 21.1 16.5 19.9C17.1 18.2 17.7 16.2 18.2 13.7C18.6 11.6 18.5 9.7 17.9 7.6C17.4 5.7 16.1 4.5 14.4 4.5C13.4 4.5 12.8 4.2 12 3.4Z"

const SPARK_PATH =
  "M18.6 1.9C18.8 3.7 19.7 4.6 21.5 4.8C19.7 5 18.8 5.9 18.6 7.7C18.4 5.9 17.5 5 15.7 4.8C17.5 4.6 18.4 3.7 18.6 1.9Z"

export function LogoMark({
  className,
  sparkClassName,
  size = 24,
}: {
  className?: string
  sparkClassName?: string
  size?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 fill-current", className)}
    >
      <path d={TOOTH_PATH} />
      <path d={SPARK_PATH} className={sparkClassName} />
    </svg>
  )
}

export function LogoLockup({
  className,
  onDark = false,
  size = 30,
  hideWordmark = false,
}: {
  className?: string
  onDark?: boolean
  size?: number
  hideWordmark?: boolean
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark
        size={size}
        className={onDark ? "text-white" : "text-primary"}
        sparkClassName="fill-primary-soft"
      />
      {!hideWordmark && (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              "truncate font-display text-[17px] font-extrabold tracking-tight",
              onDark ? "text-white" : "text-foreground"
            )}
          >
            Franel{" "}
            <span className={onDark ? "text-[14px] font-bold text-white/55" : "text-[14px] font-bold text-muted-2"}>
              Dental
            </span>
          </span>
        </span>
      )}
    </span>
  )
}
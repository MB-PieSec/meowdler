import type { ChangeEvent, JSX } from 'react'

/**
 * Phase 1 widget kit. Everything consumes the semantic CSS variables from
 * theme/flavors.css, so widgets restyle automatically on flavor switch.
 */

// -- Buttons -------------------------------------------------------------------

type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps {
  children: string
  disabled?: boolean
  onClick?: () => void
  /** Compact variant for dense rows (download list actions). */
  small?: boolean
  title?: string
  variant?: ButtonVariant
}

export function Button({
  children,
  disabled = false,
  onClick,
  small = false,
  title,
  variant = 'primary',
}: ButtonProps): JSX.Element {
  const smallClass = small ? ' btn-sm' : ''
  return (
    <button
      className={`btn btn-${variant}${smallClass}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

// -- Text entry -----------------------------------------------------------------

interface EntryProps {
  disabled?: boolean
  onChange?: (value: string) => void
  onSubmit?: () => void
  placeholder: string
  value: string
}

export function Entry({
  disabled = false,
  onChange,
  onSubmit,
  placeholder,
  value,
}: EntryProps): JSX.Element {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange?.(event.target.value)
  }
  return (
    <input
      className="entry"
      disabled={disabled}
      onChange={handleChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.()
      }}
      placeholder={placeholder}
      spellCheck={false}
      type="text"
      value={value}
    />
  )
}

// -- Progress bar -----------------------------------------------------------------

interface ProgressBarProps {
  value: number
}

/** Determinate progress bar: `value` from 0 to 100. */
export function ProgressBar({ value }: ProgressBarProps): JSX.Element {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clamped}
      className="progress-track"
      role="progressbar"
    >
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}

// -- Phase chip ---------------------------------------------------------------------

interface ChipProps {
  children: string | number
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'
}

export function Chip({ children, tone = 'neutral' }: ChipProps): JSX.Element {
  return <span className={`chip chip-${tone}`}>{children}</span>
}

// -- Settings row ----------------------------------------------------------------------

interface RowProps {
  action?: JSX.Element
  children: string
  description: string
}

/**
 * A settings row with title + description + optional trailing action.
 * `action == null` renders the "locked until later phase" placeholder.
 */
export function Row({ action, children, description }: RowProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{children}</div>
        <div className="settings-row-desc">{description}</div>
      </div>
      {action ?? <Chip tone="neutral">later</Chip>}
    </div>
  )
}

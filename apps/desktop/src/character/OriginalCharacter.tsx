import { CHARACTER_LABELS, type CharacterState } from './types';

export function OriginalCharacter({ state }: { state: CharacterState }) {
  return (
    <svg
      className={`character character-original character-${state}`}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`伴屏 · ${CHARACTER_LABELS[state]}`}
      data-animation-state={state}
    >
      <defs>
        <linearGradient id="original-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf7ec" />
          <stop offset="1" stopColor="#e6ddca" />
        </linearGradient>
      </defs>
      <g className="original-breathe">
        <rect
          x="10"
          y="14"
          width="76"
          height="68"
          rx="22"
          fill="url(#original-body)"
          stroke="#2c2822"
          strokeWidth="1.5"
        />
        <path
          d="M31 14h34"
          stroke="#2c2822"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".22"
        />
        <g className="original-eyes">
          <g className="original-eye-shape">
            <circle cx="36" cy="46" r="4.2" fill="#2c2822" />
            <circle cx="60" cy="46" r="4.2" fill="#2c2822" />
          </g>
        </g>
        <path
          className="original-mouth"
          d="M43 60c3 3 7 3 10 0"
          stroke="#2c2822"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

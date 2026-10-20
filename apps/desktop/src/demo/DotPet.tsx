import { useId } from 'react';
import { CHARACTER_LABELS, type CharacterState } from '../character/types';
import './dot-pet.css';

type EyePose = { leftY: number; rightY: number; leftHeight: number; rightHeight: number; mouth: string };
const POSES: Record<CharacterState, EyePose> = {
  idle: { leftY: 64, rightY: 64, leftHeight: 5.2, rightHeight: 5.2, mouth: 'M66 79Q70 82.5 74 79' },
  curious: { leftY: 62.5, rightY: 62.5, leftHeight: 5.8, rightHeight: 5.8, mouth: 'M65 79Q70 84 75 79' },
  thinking: { leftY: 63, rightY: 63, leftHeight: 4.6, rightHeight: 4.6, mouth: 'M67 80Q70 80.5 73 79.5' },
  viewing: { leftY: 63.5, rightY: 63.5, leftHeight: 5.5, rightHeight: 5.5, mouth: 'M66 79.5Q70 82 74 79.5' },
  responding: { leftY: 64.5, rightY: 64.5, leftHeight: 4.6, rightHeight: 4.6, mouth: 'M65.5 79Q70 83 74.5 79' },
  feedback: { leftY: 64, rightY: 64, leftHeight: 3.6, rightHeight: 3.6, mouth: 'M64.5 78.5Q70 85.5 75.5 78.5' },
  error: { leftY: 64.5, rightY: 62.5, leftHeight: 4.4, rightHeight: 5.5, mouth: 'M66 81Q69.5 77.5 74 79.5' },
  dragging: { leftY: 62, rightY: 62, leftHeight: 5.8, rightHeight: 5.8, mouth: 'M67 79.5Q70 82 73 79.5' },
};

export function DotPet({ state = 'idle' }: { state?: CharacterState }) {
  const bodyGradient = useId();
  const pose = POSES[state];

  return (
    <svg
      className="dot-pet"
      data-animation-state={state}
      viewBox="0 0 140 140"
      fill="none"
      role="img"
      aria-label={`奶油色小宠物 · ${CHARACTER_LABELS[state]}`}
    >
      <defs>
        <linearGradient id={bodyGradient} x1="70" y1="24" x2="70" y2="115" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF6DF" />
          <stop offset="1" stopColor="#F2E3C5" />
        </linearGradient>
      </defs>
      <g className="dot-pose"><g className="dot-state-motion"><g className="dot-body">
        <ellipse cx="51" cy="112" rx="11" ry="7" fill="#E9D9B8" />
        <ellipse cx="89" cy="112" rx="11" ry="7" fill="#E9D9B8" />
        <rect x="25" y="24" width="90" height="90" rx="37" fill={`url(#${bodyGradient})`} stroke="#D9C8A9" strokeWidth="0.85" />
        <ellipse cx="43" cy="76" rx="6.5" ry="3.5" fill="#E6AB9A" opacity="0.38" />
        <ellipse cx="97" cy="76" rx="6.5" ry="3.5" fill="#E6AB9A" opacity="0.38" />
        <g className="dot-gaze"><g className="dot-eye-motion"><g className="dot-eyes">
          <g className="dot-pupils">
            {state === 'feedback' ? <path d="M50.5 64Q55 59.5 59.5 64M80.5 64Q85 59.5 89.5 64" stroke="#342C25" strokeWidth="2.7" strokeLinecap="round" /> : <>
              <ellipse cx="55" cy={pose.leftY} rx="4.5" ry={pose.leftHeight} fill="#342C25" />
              <ellipse cx="85" cy={pose.rightY} rx="4.5" ry={pose.rightHeight} fill="#342C25" />
              <circle cx="53.8" cy={pose.leftY - 2} r="1.25" fill="#FFFDF5" opacity="0.95" />
              <circle cx="83.8" cy={pose.rightY - 2} r="1.25" fill="#FFFDF5" opacity="0.95" />
            </>}
          </g>
        </g></g></g>
        <path className="dot-mouth" d={pose.mouth} stroke="#8D7159" strokeWidth="1.6" strokeLinecap="round" />
      </g></g></g>
    </svg>
  );
}

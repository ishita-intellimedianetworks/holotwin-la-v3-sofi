"use client";

import { cn } from "@/lib/utils";

interface DollhouseIconProps {
  className?: string;
}

export function DollhouseIcon({ className }: DollhouseIconProps) {
  return (
    <svg
      className={cn("size-5 text-white", className)}
      viewBox="3 1 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g filter="url(#dollhouse_icon_shadow)">
        <path
          d="M10.3041 5.75243H9.18484V4.93303H10.3041V5.75243Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeMiterlimit="10"
        />
        <path
          d="M11.9584 5.75243H10.8391V4.93303H11.9584V5.75243Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeMiterlimit="10"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M18.8809 6.17626L19.1617 6.33759L19.1626 13.5873L26.1352 17.6123L26.415 17.7746V25.6614L23.4792 27.3677L22.916 26.3997L25.2949 25.017V19.0698L19.21 22.6062V28.5526L22.0966 26.8764L22.3782 27.3604L22.6589 27.8444L18.6512 30.174L3.86466 21.6364L3.58484 21.4742V6.3385L11.3486 1.82678L18.8809 6.17626ZM4.70411 20.828L18.0907 28.5562V22.608L10.8364 18.4199V14.3602H11.9557V17.1265L18.0424 13.5882L18.0415 7.63368L11.9557 11.1701V13.5408H10.8364V11.1711L4.70411 7.63004V20.828ZM12.5153 18.0963L18.6485 21.6373L24.7371 18.0981L18.6038 14.5571L12.5153 18.0963ZM5.2601 6.65842L11.3951 10.2013L17.4846 6.66207L11.3496 3.12014L5.2601 6.65842Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeMiterlimit="10"
        />
      </g>
      <defs>
        <filter
          id="dollhouse_icon_shadow"
          x="2.33484"
          y="0.537842"
          width="27.3302"
          height="32.9252"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="1" dy="1" />
          <feGaussianBlur stdDeviation="1" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0"
          />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

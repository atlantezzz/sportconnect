export function SportIcon({

  sport,

  className = "h-5 w-5",

}: {

  sport: string;

  className?: string;

}) {

  const props = {

    viewBox: "0 0 24 24",

    className,

    fill: "none",

    stroke: "currentColor",

    strokeWidth: 1.8,

    strokeLinecap: "round" as const,

    strokeLinejoin: "round" as const,

    "aria-hidden": true as const,

  };

  switch (sport) {

    case "Hardlopen":

      return (

        <svg {...props}>

          <circle cx="15.5" cy="4.5" r="2" />

          <path d="m12 8 3.5 2 3-1.5M12 8l-3 4-4 1m7-5 1 5-4 3m4-3 4 2 3 4m-11-3-4 4" />

        </svg>

      );

    case "Fitness":

      return (

        <svg {...props}>

          <path d="M6 9v6M3.5 10v4M18 9v6M20.5 10v4M6 12h12" />

        </svg>

      );

    case "Voetbal":

      return (

        <svg {...props}>

          <circle cx="12" cy="12" r="9" />

          <path d="m12 7 4 3-1.5 4.5h-5L8 10zM12 7l-1-4M8 10l-4-1M9.5 14.5l-2 4M14.5 14.5l3 3M16 10l4-1" />

        </svg>

      );

    case "Padel":

      return (

        <svg {...props}>

          <ellipse

            cx="10"

            cy="9"

            rx="5.5"

            ry="7"

            transform="rotate(35 10 9)"

          />

          <path d="m13.5 13.5 5 6M7 5l5 5M5.5 8l5 5M9 3l5 5" />

          <circle cx="19" cy="4" r="1.5" />

        </svg>

      );

    case "Basketbal":

      return (

        <svg {...props}>

          <circle cx="12" cy="12" r="9" />

          <path d="M3.5 9h17M3.5 15h17M9 3.5c4 4 4 13 0 17M15 3.5c-4 4-4 13 0 17" />

        </svg>

      );

    default:

      return (

        <svg {...props}>

          <circle cx="12" cy="12" r="9" />

        </svg>

      );

  }

}

export function MapBackground() {

  return (

    <svg

      className="map-background absolute inset-0 h-full w-full"

      viewBox="0 0 1200 850"

      preserveAspectRatio="xMidYMid slice"

      aria-hidden="true"

    >

      <rect width="1200" height="850" fill="var(--map-ground, #edf1e9)" />

      <path d="M-100 150L350 280L650 200L1000 360L1300 250" stroke="var(--map-road, #dce4d6)" strokeWidth="100" fill="none" />

      <path d="M-100 620L250 480L550 580L850 450L1300 570" stroke="var(--map-road, #dce4d6)" strokeWidth="85" fill="none" />

      <path d="M200 -50L300 200L260 420L390 900" stroke="var(--map-road-edge, #d7dfd1)" strokeWidth="65" fill="none" />

      <path d="M850 -50L770 180L900 390L800 900" stroke="var(--map-road-edge, #d7dfd1)" strokeWidth="70" fill="none" />

      <path d="M-20 370L300 320L550 390L850 310L1250 380" stroke="var(--map-road-center, #ffffff)" strokeWidth="9" fill="none" />

      <path d="M100 750L400 580L600 630L900 540L1250 680" stroke="var(--map-road-center, #ffffff)" strokeWidth="8" fill="none" />

      <path d="M470 -50L510 180L460 400L550 850" stroke="var(--map-road-center, #ffffff)" strokeWidth="8" fill="none" />

      <path d="M1030 -50L950 160L1050 380L1000 850" stroke="var(--map-road-center, #ffffff)" strokeWidth="8" fill="none" />

      <path d="M640 250C700 220 740 240 760 300C790 370 730 420 670 400C620 380 600 310 640 250Z" fill="var(--map-green, #d5e5c8)" />

      <path d="M80 430C130 390 190 410 210 460C230 520 170 550 120 530C70 510 50 470 80 430Z" fill="var(--map-green, #d5e5c8)" />

      <path d="M930 480C980 440 1040 460 1060 510C1080 570 1020 600 970 580C920 560 900 520 930 480Z" fill="var(--map-green, #d5e5c8)" />

    </svg>

  );

}

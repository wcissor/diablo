// The Diablo mark, traced from the logo (public/icon.svg in the app, the vector
// trace of logo.jpg on the same 1254 × 1254 canvas) and split by connected
// component into the head (horns and face) and the crescent (the tail).
// Coordinates are the trace's own; measurements below were taken from it.

export const HEAD_PATH =
  'M653 191.5C521.5 214.1 423.8 268.9 382.9 343 353.7 396 358.9 447.9 397.4 487.9 411.1 502 424.1 511.1 458 530 519.9 564.6 554.9 591.6 635.1 666.7 674.3 703.4 690.2 712.7 709.4 709.9 735.8 706.2 770.4 676.7 810.1 624 816.9 614.9 824.1 605.1 826 602.3 829 597.8 830.3 596.7 835.5 594.8 869.4 582.2 898.3 564.1 919 542.3 954.9 504.7 966 456 951 402.8 936.9 352.4 902.8 305.9 854.6 271.1 849.2 267.2 844.4 264 843.9 264 843.4 264 845.6 267.9 848.8 272.7 869.3 303.4 883.5 335.4 889.7 365 892.2 377.2 892.2 405.9 889.6 415 885 431.4 877.5 444.3 865.8 455.6 847.4 473.5 825.7 481.9 810.3 477.1 802.8 474.8 800.4 473.1 783.8 458.6 750.3 429.5 714.2 414.1 672.1 411 651.3 409.5 637.9 411.1 596.5 420 585.6 422.4 573.5 422.5 565.5 420.5 545.3 415.3 526.8 400.4 517.6 381.9 489 324.9 542.4 256.3 662.5 195.6 671.6 191.1 676.5 188.1 675 188.1 673.6 188.1 663.7 189.7 653 191.5Z';

export const CRESCENT_PATH =
  'M506.7 631.8C541.5 669.7 561.3 697.2 578.1 731 605.2 785.6 613.9 837 603.9 883.5 591.1 943.4 545.7 996.7 472.5 1038 447.9 1051.9 448.9 1051.3 453.4 1050.5 461.2 1049.2 488.7 1040.8 502.9 1035.4 576.4 1007.4 640 958.7 678.5 901 711.3 851.9 715 814.1 691.4 766.9 669.4 722.7 615 674 553.5 643.2 537.8 635.4 500.3 620 496.9 620 496.4 620 500.8 625.3 506.7 631.8Z';

// Bounding boxes measured from the trace (getBBox in Chromium).
export const HEAD_BOX = { x: 364.23, y: 188.1, w: 593.27, h: 522.26 };
export const CRESCENT_BOX = { x: 450.88, y: 620, w: 255.68, h: 430.85 };
export const MARK_BOX = { x: 364.23, y: 188.1, w: 593.27, h: 862.75 }; // head ∪ crescent

// Tips of the horns (topmost points of each horn) in trace coordinates.
export const HORN_TIPS = { left: { x: 675, y: 188.1 }, right: { x: 843.9, y: 264 } };

// The eyes are holes in the head, rebuilt as rounded rectangles you can animate.
// Centres and sizes are measured from the trace (in the 594 × 864 crop they sit
// at (286, 349) and (393, 370)); the leans are the brief's 10.4° and 7.6°, top
// to the right, which average the reel's 9° slit.
export interface EyeSpec {
  cx: number;
  cy: number;
  h: number; // long axis
  w: number; // short axis
  lean: number; // degrees from vertical, top to the right
}
export const EYES: [EyeSpec, EyeSpec] = [
  { cx: 650.4, cy: 536.6, h: 111.6, w: 35.0, lean: 10.4 },
  { cx: 757.1, cy: 558.0, h: 100.4, w: 32.9, lean: 7.6 },
];
export const EYES_MID = { x: (EYES[0].cx + EYES[1].cx) / 2, y: (EYES[0].cy + EYES[1].cy) / 2 };

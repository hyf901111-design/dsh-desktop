import lightNormalBoard from './home-operations-assets/illustration-light-normal-board-sharp.svg?inline'
import lightNormalNote from './home-operations-assets/illustration-light-normal-note-sharp.svg?inline'
import lightNormalPpt from './home-operations-assets/illustration-light-normal-ppt-sharp.svg?inline'
import lightNormalReport from './home-operations-assets/illustration-light-normal-report-sharp.svg?inline'
import lightHoverBoard from './home-operations-assets/illustration-light-hover-board-sharp.svg?inline'
import lightHoverNote from './home-operations-assets/illustration-light-hover-note-sharp.svg?inline'
import lightHoverPpt from './home-operations-assets/illustration-light-hover-ppt-sharp.svg?inline'
import lightHoverReport from './home-operations-assets/illustration-light-hover-report-sharp.svg?inline'
import darkNormalBoard from './home-operations-assets/illustration-dark-normal-board-sharp.svg?inline'
import darkNormalNote from './home-operations-assets/illustration-dark-normal-note-sharp.svg?inline'
import darkNormalPpt from './home-operations-assets/illustration-dark-normal-ppt-sharp.svg?inline'
import darkNormalReport from './home-operations-assets/illustration-dark-normal-report-sharp.svg?inline'
import darkHoverBoard from './home-operations-assets/illustration-dark-hover-board-sharp.svg?inline'
import darkHoverNote from './home-operations-assets/illustration-dark-hover-note-sharp.svg?inline'
import darkHoverPpt from './home-operations-assets/illustration-dark-hover-ppt-sharp.svg?inline'
import darkHoverReport from './home-operations-assets/illustration-dark-hover-report-sharp.svg?inline'
import boardGlow from './home-operations-assets/case-board-glow.svg?inline'
import noteGlow from './home-operations-assets/case-note-glow.svg?inline'
import pptGlow from './home-operations-assets/case-ppt-glow.svg?inline'
import boardDarkGlow from './home-operations-assets/case-board-dark-glow.svg?inline'
import noteDarkGlow from './home-operations-assets/case-note-dark-glow.svg?inline'
import pptDarkGlow from './home-operations-assets/case-ppt-dark-glow.svg?inline'
import reportGlow from './home-operations-assets/case-report-glow.svg?inline'
import reportDarkGlow from './home-operations-assets/case-report-dark-glow.svg?inline'
import reportTrendDark from './home-operations-assets/case-report-trend-dark.svg?inline'
import trendUp from './home-operations-assets/trend-up.svg?inline'

export type OperationsIllustrationTheme = 'light' | 'dark'
export type OperationsIllustrationState = 'normal' | 'hover'
export type OperationsIllustrationCard = 'board' | 'note' | 'ppt' | 'report'

// These static fills and the arrow retain the native Figma vector geometry.
export const OPERATIONS_CASE_GLOWS = {
  light: [boardGlow, noteGlow, pptGlow, reportGlow],
  dark: [boardDarkGlow, noteDarkGlow, pptDarkGlow, reportDarkGlow],
} as const
export const OPERATIONS_TREND_UP = trendUp
export const OPERATIONS_REPORT_TREND_DARK = reportTrendDark

// Individually exported Figma artwork; Vite embeds each SVG as a data URL.
export const OPERATIONS_ILLUSTRATIONS: Record<OperationsIllustrationTheme, Record<OperationsIllustrationState, Record<OperationsIllustrationCard, string>>> = {
  light: {
    normal: { board: lightNormalBoard, note: lightNormalNote, ppt: lightNormalPpt, report: lightNormalReport },
    hover: { board: lightHoverBoard, note: lightHoverNote, ppt: lightHoverPpt, report: lightHoverReport },
  },
  dark: {
    normal: { board: darkNormalBoard, note: darkNormalNote, ppt: darkNormalPpt, report: darkNormalReport },
    hover: { board: darkHoverBoard, note: darkHoverNote, ppt: darkHoverPpt, report: darkHoverReport },
  },
}

import {ADVANCED_CHART_VARIANTS,advancedChartDataIssue} from './advanced-chart-contract.js';
import {advancedChartView} from './advanced-chart-view.js';
import {renderProjectedChart} from './special-chart-artifact.js';

export function renderAdvancedChart(spec){
 if(!ADVANCED_CHART_VARIANTS.includes(spec?.variant)||advancedChartDataIssue(spec))return;
 return renderProjectedChart(spec,advancedChartView);
}

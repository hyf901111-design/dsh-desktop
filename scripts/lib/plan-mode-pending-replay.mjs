import {createHash} from 'node:crypto'

const marker='/* sherlock:plan-pending-replay:rc7:v1 */\n'
const cleanHash='d227ba968ecd7477b77c092c21ea139fa2ef322be691e961df99289447760393'
// The controller and UI projection must interpret the same durable selections.
// This does not execute commands, restore tool approvals, or start an agent.
function applyLoggedPlanSelection(state,event){
 if(event.type==='command/run'&&event.data.name==='plan'){
  if(event.data.args===void 0)return state
  const wanted=event.data.args.trim()!=='off'
  return wanted===state.wanted?state:{active:state.active,wanted}
 }
 if(event.type==='plan/mode')return{active:event.data.active,wanted:null}
 return state
}
function pendingPlanSelection(intents,session){
 const pending=intents.get(session)
 // A current explicit selection or exact reviewed exit takes precedence over
 // replay. In particular, never infer approval from an ordinary tool result.
 if(pending!==void 0)return pending
 let state={active:false,wanted:null}
 for(const event of session.events)state=applyLoggedPlanSelection(state,event)
 return state.wanted!==null&&state.wanted!==state.active?{active:state.wanted,narrate:true}:void 0
}
const helpers=marker+[applyLoggedPlanSelection,pendingPlanSelection].map(fn=>fn.toString()).join('\n')+'\n'
const oldApply=`apply: (state, event) => {
					if (event.type === "command/run" && event.data.name === "plan") {
						if (event.data.args === void 0) return state;
						const wanted = event.data.args.trim() !== "off";
						return wanted === state.wanted ? state : {
							active: state.active,
							wanted
						};
					}
					if (event.type === "plan/mode") return {
						active: event.data.active,
						wanted: null
					};
					return state;
				}`
const swaps=[
 ['var PlanModeController = class extends Service {',helpers+'var PlanModeController = class extends Service {',1],
 ['const pending = this.pendingIntents.get(agent.session);','const pending = pendingPlanSelection(this.pendingIntents, agent.session);',2],
 ['this.pendingIntents.get(context.agent.session)?.active','pendingPlanSelection(this.pendingIntents, context.agent.session)?.active',1],
 ['const pending = this.pendingIntents.get(session);','const pending = pendingPlanSelection(this.pendingIntents, session);',1],
 [oldApply,'apply: applyLoggedPlanSelection',1]
]
const replace=(source,from,to,count)=>{
 if(source.split(from).length!==count+1)throw Error('Plan pending replay anchor drifted')
 return source.split(from).join(to)
}
export function stripPlanPendingReplay(source){
 if(source.includes(marker))for(const[from,to,count]of [...swaps].reverse())source=replace(source,to,from,count)
 if(source.includes('pendingPlanSelection')||source.includes('applyLoggedPlanSelection')||source.includes('sherlock:plan-pending-replay'))throw Error('Plan pending replay partial install')
 if(createHash('sha256').update(source).digest('hex')!==cleanHash)throw Error('Plan mode rc7 source drifted')
 return source
}
export function patchPlanPendingReplay(source){
 let next=stripPlanPendingReplay(source)
 for(const[from,to,count]of swaps)next=replace(next,from,to,count)
 return next
}

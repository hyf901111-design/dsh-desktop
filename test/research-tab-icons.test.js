import {it,expect} from 'vitest'
import {researchTabIconKind,researchTabIcon} from '../scripts/lib/research-tab-icons.mjs'
it('uses the same neutral outline geometry in every tab and never leaves child tasks blank',()=>{
 for(const [type,kind] of [['sherlock-research-conversation','conversation'],['sherlock-subagent-conversation','task'],['subagent','task'],['sherlock-component-schedule','schedule'],['editor','folder'],['terminal','terminal'],['browser','browser'],['sherlock-knowledge-library','knowledge'],['sherlock-knowledge-file','document'],['pdf','document'],['image','image'],['unknown-plugin','panel']]){
  expect(researchTabIconKind({type})).toBe(kind)
  const icon=researchTabIcon({type},(type,props)=>({type,props}))
  expect(icon.props).toMatchObject({width:16,height:16,viewBox:'0 0 16 16',stroke:'currentColor',strokeWidth:1.25,fill:'none',strokeLinecap:'round',strokeLinejoin:'round'})
  expect(icon.props.children.props.d).toBeTruthy()
 }
})

/** Akční letáky: výběr řetězců a kontrakt pro budoucí ověřený zdroj cen. */
export const retailers = [
  {id:'lidl',name:'Lidl'}, {id:'kaufland',name:'Kaufland'},
  {id:'penny',name:'Penny'}, {id:'albert',name:'Albert'},
  {id:'tesco',name:'Tesco'}, {id:'billa',name:'Billa'},
  {id:'globus',name:'Globus'}
] as const
export type RetailerId = typeof retailers[number]['id']
export type Deal = {retailer:RetailerId;product:string;brand?:string;packageSize?:string;priceCzk:number;unitPriceCzk?:number;unit?:string;validFrom:string;validTo:string;sourceUrl:string;loyaltyRequired:boolean;verifiedAt:string}
export type DealProvider = {fetchDeals:(retailerIds:RetailerId[],names:string[])=>Promise<Deal[]>}
const storageKey=(uid:string)=>'nanakup:retailers:'+uid
export function loadRetailers(uid:string):RetailerId[] {
  try { const value:unknown=JSON.parse(localStorage.getItem(storageKey(uid))||'[]');return Array.isArray(value)?retailers.filter(r=>value.includes(r.id)).map(r=>r.id):[] }
  catch {return []}
}
export function saveRetailers(uid:string,ids:RetailerId[]) {localStorage.setItem(storageKey(uid),JSON.stringify(ids))}
/** Until a licensed/reliable data source is configured, never fabricate prices. */
export const dealProvider:DealProvider|null=null

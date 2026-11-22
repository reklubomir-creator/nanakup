export type Category = { id: string; label: string; mark: string }
const dictionary = [
  ['produce','Ovoce a zelenina','✿','banan banany jablko jablka hruska hrusky pomeranc pomerance mandarinka mandarinky citron citrony limetka avokado kiwi hrozny jahody boruvky maliny meloun ananas mango svestky broskve nektarinky rybiz tresne brambora brambory bataty cibule cesnek mrkev karotka petrzel celer repa redkvicky rajce rajcata okurka okurky paprika papriky cuketa cukety lilek brokolice kvetak kapusta zeli salat spenat rukola polnicek porek kedlubna dyne zampiony houby jablka'],
  ['bread','Pečivo','◒','rohlik rohliky rohliku houska housky chleb chleba dalamanky bageta bagety veka toast toust bulka bulky zemle croissant croissanty kobliha koblihy kolac kolace vanocka preclik pletýnka'],
  ['meat','Maso a uzeniny','◇','maso kure kureci kruti kachna husa veprove hovezi teleci sunku sunka sunky salam salamy parek parky klobasa klobasy slanina spek tlacenka jitrnice jatra losos treska pstruh kapr ryba ryby krevety'],
  ['dairy','Mléčné výrobky a vejce','◐','mleko jogurt jogurty jogurty kefir tvaroh smetana smetanu maslo syry syr eidam gouda mozzarella hermelin niva cottage ricotta parmezan skyr vejce vajicka vajicko brynza podmasli zakysanka'],
  ['frozen','Mražené výrobky','❄','mrazene mrazeny mrazena mrazenou zamrazene zmrzlina zmrzlinu nanuk nanuky hranolky krokety'],
  ['pantry','Trvanlivé potraviny','▤','ryze testoviny spagety penne fusilli mouka mouku cukr sul pepr koreni olej ocet kecup horcice majoneza tatarka konzerva konzervy fazole cocka cizrna hrasek kukurice tunak sardinky protlak passata med marmelada dzem musli vlocky granola kakao cokolada susenky oplatky chipsy orisky ořechy mandle protein strouhanka drozdi kuskus bulgur pohanka krupice pudink'],
  ['drinks','Nápoje','◉','pivo piva vino vina sekt prosecco limonada limonadu dzus dzusy voda vodu mineralka mineralka cola kofola sirup kava kavu caj energetak tonik radler'],
  ['home','Drogerie a domácnost','✦','sampon sampony samponu mydlo mydla sprchac deodorant antiperspirant kartacek kartacky pasta tampony vlozky plenky ubrousky kapesniky jar savo prasek avivaz tablety houba houbicky hadr alobal folie pytle sacky papir baterie svicky hygienicke'],
  ['health','Lékárna a zdraví','＋','paralen ibalgin ibuprofen nurofen aspirin acylpyrin vitaminy vitamin vitamín horcik magnezium naplast naplasti obvaz desinfekce dezinfekce teplomer kapky lek leky probiotika zinek'],
  ['other','Ostatní','···','']
]
export const categories: Category[] = dictionary.map(([id,label,mark]) => ({id,label,mark}))
export const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').trim().replace(/\s+/g,' ')
export function guessCategory(name: string) {
  const words = normalize(name).match(/[a-z]+/g) ?? []
  if (words.some(word => word.startsWith('mrazen') || word.startsWith('zmrzlin'))) return 'frozen'
  for (const word of words) {
    const entry = dictionary.find(([, , , synonyms]) => normalize(synonyms).split(' ').includes(word))
    if (entry) return entry[0]
  }
  return 'other'
}

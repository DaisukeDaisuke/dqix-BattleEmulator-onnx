// Shared numeric input fields for the ROM appeal calculation.
// This data declaration has no dependency on an encounter program builder.
export const APPEAL_FIELDS=[
  {name:'partyCurrentCharm',min:0,max:65535,integer:true},
  {name:'partyBaseCharm',min:0,max:65535,integer:true},
  {name:'partyEquipmentCharm',min:0,max:1023,integer:true},
  {name:'enemyAppealResistance',min:0,max:255,integer:true}
];

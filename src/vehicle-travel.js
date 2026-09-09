// Front / rear travel in metres, from the settled ride position. The exterior
// arch lip, tyre shoulder, available damper stroke and linkage sweep all limit
// compression; the visible crown gap alone is not the usable wheel travel.
export const VEHICLE_TRAVEL={
 compact:  {bump:[.080,.080],droop:[.100,.110]},
 hatchback:{bump:[.110,.120],droop:[.110,.115]},
 sedan:    {bump:[.100,.115],droop:[.100,.110]},
 wagon:    {bump:[.105,.120],droop:[.110,.120]},
 coupe:    {bump:[.075,.085],droop:[.075,.090]},
 sports:   {bump:[.045,.055],droop:[.050,.060]},
 minivan:  {bump:[.115,.105],droop:[.120,.130]},
 suv:      {bump:[.180,.195],droop:[.150,.160]},
 pickup:   {bump:[.180,.170],droop:[.150,.180]},
 offroad:  {bump:[.170,.130],droop:[.180,.190]},
};

/**
 * C15 world-to-display adapter. PRESENTATION ONLY.
 *
 * C15 authority uses a 13.2 x 15 world arena independently of the device
 * aspect ratio. A portrait Babylon camera at +/-15 vertical only sees +/-6.75
 * horizontally on a 360x800 screen; projecting kernel X directly clips the
 * player even though the server considers the position legal.
 *
 * This adapter fits the ENTIRE playable arena into the visible CSS viewport,
 * reserving room for the real HUD, retreat control and the 2.4-unit ship art.
 * It must never change journal inputs, physics, hitboxes or rules digests.
 */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

export function createC15VisualViewportV1({width,height,arenaHalfWidth=13200,
  arenaHalfHeight=15000,hitRadius=700,worldHalfHeight=15,visualHalfSize=1.35,
  edgePaddingPx=12}={}){
  if(![width,height,arenaHalfWidth,arenaHalfHeight,hitRadius,worldHalfHeight,visualHalfSize,edgePaddingPx].every(finite)
    ||width<200||height<300||width>20000||height>20000
    ||arenaHalfWidth<=hitRadius||arenaHalfHeight<=hitRadius||hitRadius<=0
    ||worldHalfHeight<=0||visualHalfSize<=0||edgePaddingPx<0){
    throw new TypeError('C15 visual viewport invalid');
  }
  const halfWidth=worldHalfHeight*width/height;
  const unitPerPixel=2*worldHalfHeight/height;
  // Right/left always reserve art half-size, including exhaust padding.
  const horizontalLimit=halfWidth-visualHalfSize-edgePaddingPx*unitPerPixel;
  const topPaddingPx=clamp(height*.20,150,195);
  const bottomPaddingPx=clamp(height*.125,90,130);
  const topZ=-worldHalfHeight+topPaddingPx*unitPerPixel;
  const bottomZ=worldHalfHeight-bottomPaddingPx*unitPerPixel;
  if(horizontalLimit<=0||bottomZ<=topZ)throw new RangeError('C15 visual viewport too small');
  const playableX=(arenaHalfWidth-hitRadius)/1000;
  const playableZ=(arenaHalfHeight-hitRadius)/1000;
  const xFactor=horizontalLimit/playableX;
  const zFactor=(bottomZ-topZ)/(2*playableZ);
  const zCenter=(topZ+bottomZ)/2;
  function project(position){
    if(!position||!finite(position.xUnits)||!finite(position.zUnits))throw new TypeError('C15 world point invalid');
    return {x:position.xUnits/1000*xFactor,z:position.zUnits/1000*zFactor+zCenter};
  }
  function unproject(position){
    if(!position||!finite(position.x)||!finite(position.z))throw new TypeError('C15 display point invalid');
    return {xUnits:Math.round(position.x/xFactor*1000),zUnits:Math.round((position.z-zCenter)/zFactor*1000)};
  }
  function screenPixel(position){
    const p=project(position);
    return {x:width/2+(p.x/(2*halfWidth))*width,
      y:height/2+(p.z/(2*worldHalfHeight))*height};
  }
  return Object.freeze({width,height,halfWidth,worldHalfHeight,playableX,playableZ,
    visualHalfSize,topPaddingPx,bottomPaddingPx,horizontalLimit,topZ,bottomZ,
    project,unproject,screenPixel});
}

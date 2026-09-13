let shareMap, shareMarker, locateMap, locateMarker;

document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.tab).classList.add("active");
});

function setStatus(id, msg, error=false) {
  const el=document.getElementById(id); el.textContent=msg; el.className="status"+(error?" error":"");
}
function makeMap(id, lat, lon, current) {
  if (current === "share") {
    document.getElementById(id).hidden=false;
    if (!shareMap) {
      shareMap=L.map(id).setView([lat,lon],16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(shareMap);
      shareMarker=L.marker([lat,lon]).addTo(shareMap);
    } else { shareMap.setView([lat,lon],16); shareMarker.setLatLng([lat,lon]); }
  } else {
    document.getElementById(id).hidden=false;
    if (!locateMap) {
      locateMap=L.map(id).setView([lat,lon],16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(locateMap);
      locateMarker=L.marker([lat,lon]).addTo(locateMap);
    } else { locateMap.setView([lat,lon],16); locateMarker.setLatLng([lat,lon]); }
  }
}

async function sendLocation() {
  const name=document.getElementById("shareName").value.trim();
  const password=document.getElementById("sharePassword").value;
  if(!name || password.length<6){setStatus("shareStatus","Preencha nome e uma senha de pelo menos 6 caracteres.",true);return;}
  if(!navigator.geolocation){setStatus("shareStatus","Este navegador não oferece geolocalização.",true);return;}
  setStatus("shareStatus","Pedindo permissão e obtendo sua localização…");
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude,accuracy}=pos.coords;
    try{
      const r=await fetch("/api/location",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,password,latitude,longitude,accuracy})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||"Não foi possível compartilhar.");
      document.getElementById("shareCoords").hidden=false;
      document.getElementById("shareCoords").textContent=`Latitude: ${latitude.toFixed(6)} | Longitude: ${longitude.toFixed(6)} | Precisão: ${Math.round(accuracy||0)} m`;
      makeMap("shareMap",latitude,longitude,"share");
      document.getElementById("updateBtn").hidden=false;
      setStatus("shareStatus",`Localização compartilhada. Expira em ${data.ttlMinutes} minutos.`);
    }catch(e){setStatus("shareStatus",e.message,true);}
  }, err=>setStatus("shareStatus","Não foi possível obter a localização: "+err.message,true),
  {enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
document.getElementById("shareBtn").onclick=sendLocation;
document.getElementById("updateBtn").onclick=sendLocation;

document.getElementById("locateBtn").onclick=async()=>{
  const name=document.getElementById("locateName").value.trim();
  const password=document.getElementById("locatePassword").value;
  if(!name||!password){setStatus("locateStatus","Informe nome e senha.",true);return;}
  setStatus("locateStatus","Consultando localização…");
  try{
    const r=await fetch("/api/locate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,password})});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"Não foi possível localizar.");
    document.getElementById("locateCoords").hidden=false;
    document.getElementById("locateCoords").textContent=`Latitude: ${data.latitude.toFixed(6)} | Longitude: ${data.longitude.toFixed(6)} | Atualizado: ${new Date(data.updatedAt).toLocaleString("pt-BR")}`;
    makeMap("locateMap",data.latitude,data.longitude,"locate");
    setStatus("locateStatus","Localização encontrada.");
  }catch(e){setStatus("locateStatus",e.message,true);}
};

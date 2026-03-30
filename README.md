# Gestión Hogar | Cloud Sync

Para sincronizar esta aplicación con una planilla de Google Sheets, sigue estos pasos:

### 1. Preparar la Planilla
Crea una nueva Google Sheet con las siguientes columnas en la primera fila:
`Fecha | Tipo | Monto | Categoria | Detalle | Responsable`

### 2. Apps Script
1. En la planilla, ve a **Extensiones > Apps Script**.
2. Borra todo lo que haya y pega el siguiente código:

```javascript
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var json = data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(json))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([
    new Date(), 
    params.type, 
    params.monto, 
    params.categoria, 
    params.detalle, 
    params.responsable
  ]);
  return ContentService.createTextOutput("Success")
    .setMimeType(ContentService.MimeType.TEXT);
}
```

### 3. Desplegar
1. Haz clic en **Implementar > Nueva implementación**.
2. Selecciona **Aplicación web**.
3. En 'Quién tiene acceso', selecciona **Cualquiera** (Importante).
4. Copia la **URL de la aplicación web**.

### 4. Vincular en la App
Dentro de la aplicación Gestión Hogar, haz clic en **CONECTAR NUBE** y pega la URL que copiaste. ¡Listo! Cada movimiento que guardes se enviará automáticamente a tu planilla.

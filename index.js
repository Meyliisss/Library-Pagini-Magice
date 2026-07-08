const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const sass = require('sass');

const app = express();
const port = 8080;

const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
for (let folder of vect_foldere) {
    let caleFolder = path.join(__dirname, folder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(caleFolder);
    }
}

// crearea variabilei globale și a funcțiilor de inițializare
let obGlobal = {
    obErori: null,
    obGalerie: null,
    imaginileRedimensionate: false,
    folderScss: path.join(__dirname, 'resurse', 'scss'),
    folderCss: path.join(__dirname, 'resurse', 'css')
};

// asigurarea crearea folderelor de resurse scss și css dacă nu există
if (!fs.existsSync(obGlobal.folderScss)) {
    fs.mkdirSync(obGlobal.folderScss, { recursive: true });
}
if (!fs.existsSync(obGlobal.folderCss)) {
    fs.mkdirSync(obGlobal.folderCss, { recursive: true });
}

// Tokenises JSON to verify lexical, helps us to identufy duplicated keysfrom objects and JSON.parse() overwrites them

function tokenizeJson(jsonStr) {
    let tokens = [];
    let i = 0;
    while (i < jsonStr.length) {
        let char = jsonStr[i];

        if (/\s/.test(char)) {
            i++;
            continue;
        }

        // Punctuație specifică structurii JSON
        if (char === '{' || char === '}' || char === '[' || char === ']' || char === ':' || char === ',') {
            tokens.push({ type: 'punctuation', value: char, pos: i });
            i++;
            continue;
        }

        // Parsare șiruri de caractere delimitate de string
        if (char === '"') {
            let strValue = "";
            let startPos = i;
            i++; 

            while (i < jsonStr.length) {
                if (jsonStr[i] === '\\') {
                    // Dacă avem un caracter escape (ex: \"), îl adăugăm împreună cu următorul caracter
                    strValue += jsonStr[i] + (jsonStr[i + 1] || '');
                    i += 2;
                } else if (jsonStr[i] === '"') {
                    i++; 
                    break;
                } else {
                    strValue += jsonStr[i];
                    i++;
                }
            }
            tokens.push({ type: 'string', value: strValue, pos: startPos });
            continue;
        }

        // Parsare valori literale: booleene (true, false), null sau numere
        let valueMatch = jsonStr.slice(i).match(/^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)/);
        if (valueMatch) {
            tokens.push({ type: 'literal', value: valueMatch[0], pos: i });
            i += valueMatch[0].length;
            continue;
        }

        // În caz de caracter necunoscut, mergem mai departe
        i++;
    }
    return tokens;
}

/**
 * Funcția de validare a fișierului erori.json conform cerințelor A-G.
 * Afișează mesaje detaliate și oprește aplicația în caz de eroare critică (lipsa fișierului).
 */
function valideazaEroriJson() {
    const caleFisier = path.join(__dirname, 'resurse', 'json', 'erori.json');

    // A 
    // verificarea dacă fișierul erori.json există fizic în sistem
    if (!fs.existsSync(caleFisier)) {
        console.error("\x1b[31m%s\x1b[0m", "======================================================================");
        console.error("\x1b[31m%s\x1b[0m", "[CRITIC - Cerința A] Fișierul obligatoriu 'erori.json' nu a fost găsit!");
        console.error(`Cale căutată: ${caleFisier}`);
        console.error("Remediere: Creați fișierul 'erori.json' în directorul 'resurse/json/'.");
        console.error("Aplicația se va închide acum pentru a preveni funcționarea defectuoasă.");
        console.error("\x1b[31m%s\x1b[0m", "======================================================================");
        process.exit(1); 
    }

    // citirea conținutul brut al fișierului ca text
    let continutBrut = "";
    try {
        continutBrut = fs.readFileSync(caleFisier, 'utf8');
    } catch (e) {
        console.error(`[Eroare] Nu s-a putut citi fișierul erori.json: ${e.message}`);
        return;
    }

    // F
    // verificarea dacă există chei duplicate în cadrul aceluiași obiect JSON din fișier (analiză pe text/string)
    const tokens = tokenizeJson(continutBrut);
    let stack = [];

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'punctuation' && token.value === '{') {
            stack.push({ type: 'object', keys: new Set() });
        } else if (token.type === 'punctuation' && token.value === '}') {
            if (stack.length > 0 && stack[stack.length - 1].type === 'object') {
                stack.pop();
            }
        } else if (token.type === 'punctuation' && token.value === '[') {
            stack.push({ type: 'array' });
        } else if (token.type === 'punctuation' && token.value === ']') {
            if (stack.length > 0 && stack[stack.length - 1].type === 'array') {
                stack.pop();
            }
        } else if (token.type === 'string') {
            // Dacă după string urmează caracterul ':' înseamnă că acest string este o cheie
            let urmatorulToken = tokens[i + 1];
            if (urmatorulToken && urmatorulToken.type === 'punctuation' && urmatorulToken.value === ':') {
                let contextCurent = stack[stack.length - 1];
                if (contextCurent && contextCurent.type === 'object') {
                    // Dacă cheia există deja în Set-ul obiectului curent, avem un duplicat!
                    if (contextCurent.keys.has(token.value)) {
                        console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința F] Cheia '${token.value}' este specificată de mai multe ori într-un obiect din erori.json!`);
                        console.error(`Poziție în fișier (caracter): în jurul indexului ${token.pos}.`);
                        console.error("Remediere: Deschideți erori.json și eliminați cheia duplicat din obiect.");
                    } else {
                        contextCurent.keys.add(token.value);
                    }
                }
            }
        }
    }

    // Încercăm să parsăm JSON-ul pentru restul verificărilor structurale
    let dateJson;
    try {
        dateJson = JSON.parse(continutBrut);
    } catch (err) {
        console.error("\x1b[31m%s\x1b[0m", "[EROARE CRITICĂ] Fișierul erori.json nu este un JSON valid sintactic.");
        console.error(`Mesaj eroare parsare: ${err.message}`);
        return; 
    }

    // B
    // Verificăm prezența proprietăților obligatorii de top: info_erori, cale_baza, eroare_default
    const proprietatiDeBaza = ['info_erori', 'cale_baza', 'eroare_default'];
    for (let prop of proprietatiDeBaza) {
        if (!dateJson.hasOwnProperty(prop)) {
            console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința B] Proprietatea obligatorie '${prop}' lipsește de la rădăcina fișierului erori.json!`);
            console.error(`Remediere: Adăugați proprietatea "${prop}" la nivelul principal al fișierului JSON.`);
        }
    }

    // C
    // Verificăm dacă pentru eroarea default lipsesc proprietăți esențiale: titlu, text, imagine
    if (dateJson.hasOwnProperty('eroare_default')) {
        const erDefault = dateJson.eroare_default;
        if (!erDefault || typeof erDefault !== 'object') {
            console.error("\x1b[33m%s\x1b[0m", "[AVERTISMENT - Cerința C] Proprietatea 'eroare_default' trebuie să fie un obiect valid!");
        } else {
            const propDefault = ['titlu', 'text', 'imagine'];
            for (let p of propDefault) {
                if (!erDefault.hasOwnProperty(p)) {
                    console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința C] Pentru eroarea implicită (eroare_default) lipsește proprietatea '${p}'!`);
                    console.error(`Remediere: Adăugați "${p}" în obiectul "eroare_default".`);
                }
            }
        }
    }

    // D
    // Verificăm dacă folderul specificat în 'cale_baza' există în sistemul de fișiere
    let caleBazaValida = false;
    let absoluteCaleBaza = "";
    if (dateJson.hasOwnProperty('cale_baza')) {
        absoluteCaleBaza = path.join(__dirname, dateJson.cale_baza);
        if (!fs.existsSync(absoluteCaleBaza) || !fs.statSync(absoluteCaleBaza).isDirectory()) {
            console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința D] Directorul indicat în 'cale_baza' ("${dateJson.cale_baza}") nu există în sistemul de fișiere!`);
            console.error(`Cale completă căutată: ${absoluteCaleBaza}`);
            console.error("Remediere: Creați directorul respectiv sau modificați valoarea din 'cale_baza'.");
        } else {
            caleBazaValida = true;
        }
    }

    // E
    // Verificăm dacă imaginile asociate erorilor există în sistemul de fișiere
    if (caleBazaValida) {
        // Verificăm imaginea de la eroare_default
        if (dateJson.eroare_default && dateJson.eroare_default.imagine) {
            const caleImgDefault = path.join(absoluteCaleBaza, dateJson.eroare_default.imagine);
            if (!fs.existsSync(caleImgDefault)) {
                console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința E] Imaginea erorii implicite ("${dateJson.eroare_default.imagine}") nu există în directorul de erori!`);
                console.error(`Cale completă căutată: ${caleImgDefault}`);
                console.error(`Remediere: Adăugați fișierul '${dateJson.eroare_default.imagine}' în directorul '${absoluteCaleBaza}'.`);
            }
        }

        // Verificăm imaginile din vectorul de erori specifice
        if (Array.isArray(dateJson.info_erori)) {
            for (let eroare of dateJson.info_erori) {
                if (eroare && eroare.imagine) {
                    const caleImgEroare = path.join(absoluteCaleBaza, eroare.imagine);
                    if (!fs.existsSync(caleImgEroare)) {
                        console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința E] Imaginea "${eroare.imagine}" asociată erorii cu identificatorul ${eroare.identificator || 'Nespecificat'} nu există în folderul de erori!`);
                        console.error(`Cale completă căutată: ${caleImgEroare}`);
                        console.error(`Remediere: Adăugați fișierul '${eroare.imagine}' în directorul '${absoluteCaleBaza}'.`);
                    }
                }
            }
        }
    }

    // G
    // Verificăm dacă există mai multe erori cu același identificator în vectorul de erori
    if (Array.isArray(dateJson.info_erori)) {
        let identificatoriVazuti = {};
        for (let eroare of dateJson.info_erori) {
            if (eroare && eroare.hasOwnProperty('identificator')) {
                let id = eroare.identificator;
                if (!identificatoriVazuti[id]) {
                    identificatoriVazuti[id] = [];
                }
                identificatoriVazuti[id].push(eroare);
            }
        }

        for (let id in identificatoriVazuti) {
            if (identificatoriVazuti[id].length > 1) {
                console.error("\x1b[33m%s\x1b[0m", `[AVERTISMENT - Cerința G] Există mai multe obiecte eroare în 'info_erori' care folosesc același identificator (${id}):`);
                identificatoriVazuti[id].forEach((er, index) => {
                    // Extragem toate proprietățile obiectului în afară de proprietatea 'identificator'
                    let alteProprietati = Object.keys(er)
                        .filter(key => key !== 'identificator')
                        .map(key => `${key}: ${JSON.stringify(er[key])}`)
                        .join(', ');
                    console.error(`  - Eroarea duplicate ${index + 1}: { ${alteProprietati} }`);
                });
                console.error("Remediere: Schimbați identificatorii astfel încât fiecare eroare să aibă un cod unic.");
            }
        }
    }
}

function initErori() {
    valideazaEroriJson();

    try {
        const continutErori = fs.readFileSync(path.join(__dirname, 'resurse', 'json', 'erori.json'), 'utf8');
        obGlobal.obErori = JSON.parse(continutErori);

        // Folosim operatori de siguranță (|| "") pentru a preveni erorile de tip TypeError
        // în cazul în care 'cale_baza' sau proprietățile din JSON lipsesc temporar
        const caleBaza = obGlobal.obErori.cale_baza || "";

        if (obGlobal.obErori.eroare_default && obGlobal.obErori.eroare_default.imagine) {
            obGlobal.obErori.eroare_default.imagine = path.join(caleBaza, obGlobal.obErori.eroare_default.imagine);
        }

        if (Array.isArray(obGlobal.obErori.info_erori)) {
            for (let eroare of obGlobal.obErori.info_erori) {
                if (eroare && eroare.imagine) {
                    eroare.imagine = path.join(caleBaza, eroare.imagine);
                }
            }
        }
    } catch (err) {
        console.error("Eroare la citirea sau parsarea fișierului erori.json:", err);
    }
}
initErori();

/**
 * Inițializează datele galeriei statice din fișierul galerie.json.
 * Se rulează la pornirea serverului.
 */
function initGalerie() {
    try {
        const caleGalerieJson = path.join(__dirname, 'resurse', 'json', 'galerie.json');
        if (fs.existsSync(caleGalerieJson)) {
            const continutGalerie = fs.readFileSync(caleGalerieJson, 'utf8');
            obGlobal.obGalerie = JSON.parse(continutGalerie);
        } else {
            console.error("[AVERTISMENT] Fișierul obligatoriu 'galerie.json' nu a fost găsit în 'resurse/json/'.");
        }
    } catch (err) {
        console.error("Eroare la citirea sau parsarea fișierului galerie.json:", err);
    }
}
initGalerie();

/**
 * Generează versiuni redimensionate ale imaginilor din galerie cu sufixe pentru picture,
 * respectiv: -large (450px lățime), -medium (300px) și -small (200px), toate tăiate uniform (crop).
 * Această operație se execută asincron când un client cere pagina.
 */
async function genereazaImaginiGalerie(galerie) {
    if (!galerie || !Array.isArray(galerie.imagini)) return;

    const absoluteCaleGalerie = path.join(__dirname, galerie.cale_galerie);

    for (let img of galerie.imagini) {
        const caleOriginala = path.join(absoluteCaleGalerie, img.cale_imagine);

        // Verificăm dacă imaginea originală (ex: magie_carti_1.png) există fizic pe disc
        if (!fs.existsSync(caleOriginala)) {
            console.error(`[Eroare Redimensionare] Imaginea originală ${img.cale_imagine} nu există la calea: ${caleOriginala}`);
            continue;
        }

        // Extragem extensia și numele fișierului
        const ext = path.extname(img.cale_imagine);
        const numeBaza = path.basename(img.cale_imagine, ext);

        // Căile fișierelor rezultate
        const caleLarge = path.join(absoluteCaleGalerie, `${numeBaza}-large${ext}`);
        const caleMedium = path.join(absoluteCaleGalerie, `${numeBaza}-medium${ext}`);
        const caleSmall = path.join(absoluteCaleGalerie, `${numeBaza}-small${ext}`);

        try {
            // 1. Generăm imaginea LARGE (450x300px) dacă nu există deja
            if (!fs.existsSync(caleLarge)) {
                await sharp(caleOriginala)
                    .resize(450, 300, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .toFile(caleLarge);
                console.log(`[Sharp] Generat imagine LARGE (450x300): ${numeBaza}-large${ext}`);
            }

            // 2. Generăm imaginea MEDIUM (300x200px) dacă nu există deja
            if (!fs.existsSync(caleMedium)) {
                await sharp(caleOriginala)
                    .resize(300, 200, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .toFile(caleMedium);
                console.log(`[Sharp] Generat imagine MEDIUM (300x200): ${numeBaza}-medium${ext}`);
            }

            // 3. Generăm imaginea SMALL (200x133px) dacă nu există deja
            if (!fs.existsSync(caleSmall)) {
                await sharp(caleOriginala)
                    .resize(200, 133, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .toFile(caleSmall);
                console.log(`[Sharp] Generat imagine SMALL (200x133): ${numeBaza}-small${ext}`);
            }
        } catch (err) {
            console.error(`[Eroare Sharp] Redimensionarea imaginii ${img.cale_imagine} a eșuat:`, err);
        }
    }
}

// funcția de afișare a erorilor
function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroareBaza = obGlobal.obErori.eroare_default;
    let eroareGasita = false;

    if (identificator) {
        let eroareDinJson = obGlobal.obErori.info_erori.find(e => e.identificator == identificator);
        if (eroareDinJson) {
            eroareBaza = eroareDinJson;
            eroareGasita = true;
        }
    }

    let titluFinal = titlu || eroareBaza.titlu;
    let textFinal = text || eroareBaza.text;
    let imagineFinala = imagine || eroareBaza.imagine;

    if (eroareBaza.status && identificator && eroareGasita) {
        res.status(identificator);
    } else if (eroareBaza.status && eroareBaza.identificator) {
        res.status(eroareBaza.identificator);
    } else if (!identificator) {
        res.status(500);
    }

    res.render('pagini/eroare', {
        titlu: titluFinal,
        text: textFinal,
        imagine: imagineFinala
    });
}


// Setarea motorului de șabloane
app.set('view engine', 'ejs');

// Adăugarea IP-ului în locals, generarea imaginilor și filtrarea lor după ora serverului
app.use(async (req, res, next) => {
    res.locals.ip = req.ip;

    // Verificăm și generăm asincron versiunile redimensionate ale imaginilor din galerie (Sharp)
    // în momentul în care clientul cere orice pagină (dacă acestea nu există deja pe disc)
    // OPTIMIZARE: Se execută verificarea fizică o singură dată per ciclu de viață al serverului
    if (obGlobal.obGalerie && !obGlobal.imaginileRedimensionate) {
        try {
            await genereazaImaginiGalerie(obGlobal.obGalerie);
            obGlobal.imaginileRedimensionate = true;
        } catch (err) {
            console.error("Eroare în middleware la redimensionarea imaginilor:", err);
        }
    }

    // VARIABILĂ DE SIMULARE A DATEI/OREI PENTRU VERIFICARE (Cerința din Observație)
    // 1. Pentru a simula ora 19:00 (afișează exact 6 imagini, arătând schimbarea): navigare la /galerie?ora=19:00 sau new Date("2026-07-05T19:00:00")
    // 2. Pentru a simula ora 12:00 (afișează exact 10 imagini active, formând grid-ul complet 3x4): navigare la /galerie?ora=12:00 sau new Date("2026-07-05T12:00:00")
    // 3. Pentru a folosi ora reală a serverului: new Date()
    let dataVerificareGaleri = new Date("2026-07-05T12:00:00"); // implicit 12:00 ca bază de testare

    // Dacă utilizatorul specifică manual ora din query (de ex: ?ora=19:00 sau ?ora=09:30), folosim acea oră
    if (req.query.ora && typeof req.query.ora === 'string') {
        const parts = req.query.ora.split(':');
        if (parts.length === 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(h) && h >= 0 && h < 24 && !isNaN(m) && m >= 0 && m < 60) {
                dataVerificareGaleri = new Date();
                dataVerificareGaleri.setHours(h, m, 0, 0);
            }
        }
    }

    // Filtrare imagini după ora serverului (simulată sau reală)
    if (obGlobal.obGalerie && Array.isArray(obGlobal.obGalerie.imagini)) {
        const acum = dataVerificareGaleri;
        const oreCurent = acum.getHours();
        const minuteCurent = acum.getMinutes();
        const minuteCurentTotal = oreCurent * 60 + minuteCurent;

        // Transmitem ora simulată formatată în locals pentru afișarea în pagină (Bonus Creativitate)
        res.locals.oraSimulata = `${oreCurent.toString().padStart(2, '0')}:${minuteCurent.toString().padStart(2, '0')}`;

        const imaginiFiltrate = obGlobal.obGalerie.imagini.filter(img => {
            if (!img.timp || !img.timp.includes('-')) return false;

            // Parsăm intervalul de tip "HH:MM-HH:MM"
            const [startStr, endStr] = img.timp.split('-');
            const [startH, startM] = startStr.split(':').map(Number);
            const [endH, endM] = endStr.split(':').map(Number);

            // Convertim în total minute de la începutul zilei pentru o comparare ușoară
            const minuteStart = startH * 60 + startM;
            const minuteEnd = endH * 60 + endM;

            // Verificăm dacă ora curentă se află în interiorul intervalului definit
            return minuteCurentTotal >= minuteStart && minuteCurentTotal <= minuteEnd;
        }).slice(0, 10).map(img => {
            // Clonăm obiectul imaginii pentru a nu polua baza de date globală în memorie
            const imgClona = { ...img };

            // Calculăm timpul rămas (Funcționalitate Creativă)
            const [startStr, endStr] = imgClona.timp.split('-');
            const [endH, endM] = endStr.split(':').map(Number);
            const minuteEnd = endH * 60 + endM;
            const minuteRamase = minuteEnd - minuteCurentTotal;

            if (minuteRamase > 0) {
                const ore = Math.floor(minuteRamase / 60);
                const min = minuteRamase % 60;
                imgClona.timpRamas = `Activ încă: ${ore > 0 ? ore + 'h ' : ''}${min}m`;
            } else {
                imgClona.timpRamas = "Expiră acum";
            }
            return imgClona;
        });

        // Transmitem doar imaginile filtrate către șabloanele EJS
        res.locals.galerie = {
            cale_galerie: obGlobal.obGalerie.cale_galerie,
            imagini: imaginiFiltrate
        };
    } else {
        res.locals.galerie = null;
        res.locals.oraSimulata = null;
    }

    next();
});

// folderul static
app.use('/resurse', express.static(path.join(__dirname, 'resurse')));

// Eroare 403 forbiden cautare prin foldere
app.use(/^\/resurse.*/, (req, res) => {
    if (!req.path.match(/\.[a-zA-Z0-9]+$/) || req.path.endsWith('/')) {
        afisareEroare(res, 403);
    } else {
        afisareEroare(res, 404);
    }
});

// afișarea informațiilor despre directoare și fișiere
console.log("Calea folderului (__dirname):", __dirname);
console.log("Calea fișierului (__filename):", __filename);
console.log("Folderul curent de lucru (process.cwd()):", process.cwd());



// restricționarea accesului direct la fișiere .ejs
app.use((req, res, next) => {
    if (req.path.endsWith('.ejs')) {
        afisareEroare(res, 400);
    } else {
        next();
    }
});

// rută specifică pentru favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'resurse', 'ico', 'favicon.ico'));
});

// rutare pentru prima pagină
app.get(['/', '/index', '/home'], (req, res) => {
    res.render('pagini/index');
});

// rută generală pentru orice pagină
app.get(/^.*$/, (req, res) => {
    res.render(path.join('pagini', req.path), function (err, html) {
        // tratarea specifică a erorilor de randare
        if (err) {
            if (err.message.startsWith('Failed to lookup view')) {
                afisareEroare(res, 404);
            } else {
                afisareEroare(res);
            }
        } else {
            res.send(html);
        }
    });
});

/**
 * Compilează un fișier SCSS (sau SASS) în fișier CSS.
 * @param {string} caleScss - Calea către fișierul SCSS/SASS 
 * @param {string} [caleCss] - Calea către fișierul CSS 
 */
function compileazaScss(caleScss, caleCss) {
    try {
        // Stabilim calea absolută pentru SCSS/SASS
        let absoluteScss = path.isAbsolute(caleScss) ? caleScss : path.join(obGlobal.folderScss, caleScss);
        
        // Stabilim calea absolută pentru CSS
        let absoluteCss = "";
        if (caleCss) {
            absoluteCss = path.isAbsolute(caleCss) ? caleCss : path.join(obGlobal.folderCss, caleCss);
        } else {
            let numeBaza = path.basename(absoluteScss, path.extname(absoluteScss));
            absoluteCss = path.join(obGlobal.folderCss, numeBaza + '.css');
        }

        // Verificăm dacă fișierul SCSS există
        if (!fs.existsSync(absoluteScss)) {
            console.error(`[SCSS] Fișierul sursă nu există la calea: ${absoluteScss}`);
            return;
        }

        // Salvare în backup a fișierului CSS vechi dacă acesta există
        if (fs.existsSync(absoluteCss)) {
            try {
                let backupDir = path.join(__dirname, 'backup', 'resurse', 'css');
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                let numeFisier = path.basename(absoluteCss);
                let ext = path.extname(numeFisier);
                let numeFaraExt = path.basename(numeFisier, ext);
                
                // Integrăm timpul creării în numele fișierului de backup pentru a păstra istoricul
                let timestamp = new Date().toISOString().replace(/:/g, '-');
                let backupPath = path.join(backupDir, `${numeFaraExt}_${timestamp}${ext}`);
                
                fs.copyFileSync(absoluteCss, backupPath);
                console.log(`[Backup SCSS] Succes: Backup fișier CSS vechi salvat la: ${backupPath}`);
            } catch (copyErr) {
                console.error(`[Eroare Backup SCSS] Eșec la copierea în backup a fișierului ${absoluteCss}:`, copyErr.message);
            }
        }

        // Compilare SCSS/SASS în CSS folosind pachetul sass
        const result = sass.compile(absoluteScss);
        
        // Scriem codul compilat în fișierul CSS
        fs.writeFileSync(absoluteCss, result.css);
        console.log(`[SCSS] Compilare finalizată cu succes: ${absoluteScss} -> ${absoluteCss}`);
    } catch (err) {
        console.error(`[Eroare SCSS] Eșec la compilarea fișierului ${caleScss}:`, err.message);
    }
}

// Compilarea inițială: compilează toate fișierele .scss și .sass din folderScss.
function compileazaInitialScss() {
    try {
        if (fs.existsSync(obGlobal.folderScss)) {
            const files = fs.readdirSync(obGlobal.folderScss);
            for (let file of files) {
                if (file.endsWith('.scss') || file.endsWith('.sass')) {
                    compileazaScss(file);
                }
            }
            console.log(`[SCSS] Compilarea inițială a fost finalizată.`);
        }
    } catch (err) {
        console.error("[SCSS] Eroare în timpul compilării inițiale:", err.message);
    }
}

//Monitorizează modificările fișierelor din folderScss.

function pornesteWatcherScss() {
    try {
        if (fs.existsSync(obGlobal.folderScss)) {
            let debounceTimeout = {};
            fs.watch(obGlobal.folderScss, (eventType, filename) => {
                if (filename && (filename.endsWith('.scss') || filename.endsWith('.sass'))) {
                    // Debounce pentru a preveni multiple apeluri simultane pe același eveniment
                    if (debounceTimeout[filename]) {
                        clearTimeout(debounceTimeout[filename]);
                    }
                    debounceTimeout[filename] = setTimeout(() => {
                        console.log(`[SCSS Watcher] Modificare detectată în fișierul: ${filename}. Recompilare...`);
                        compileazaScss(filename);
                        delete debounceTimeout[filename];
                    }, 100);
                }
            });
            console.log(`[SCSS Watcher] Monitorizarea folderului de SCSS este activă.`);
        }
    } catch (err) {
        console.error("[SCSS Watcher] Eroare la inițierea monitorizării:", err.message);
    }
}

// Rulăm compilarea inițială și pornim watcher-ul pe parcurs
compileazaInitialScss();
pornesteWatcherScss();

app.listen(port, () => {
    console.log(`Serverul a pornit pe portul ${port}`);
});

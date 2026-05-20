const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 8080;

const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
for (let folder of vect_foldere) {
    let caleFolder = path.join(__dirname, folder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(caleFolder);
    }
}

// crearea variabilei globale și a funcției de inițializare a erorilor
let obGlobal = {
    obErori: null
};

function initErori() {
    try {
        const continutErori = fs.readFileSync(path.join(__dirname, 'resurse', 'json', 'erori.json'), 'utf8');
        obGlobal.obErori = JSON.parse(continutErori);

        const caleBaza = obGlobal.obErori.cale_baza;

        obGlobal.obErori.eroare_default.imagine = path.join(caleBaza, obGlobal.obErori.eroare_default.imagine);

        for (let eroare of obGlobal.obErori.info_erori) {
            eroare.imagine = path.join(caleBaza, eroare.imagine);
        }
    } catch (err) {
        console.error("Eroare la citirea sau parsarea fișierului erori.json:", err);
    }
}
initErori();

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

// Adăugarea IP-ului în locals pentru a fi accesibil în toate view-urile
app.use((req, res, next) => {
    res.locals.ip = req.ip;
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
    res.render(path.join('pagini', req.url), function (err, html) {
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

app.listen(port, () => {
    console.log(`Serverul a pornit pe portul ${port}`);
});

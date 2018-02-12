// 3rd Parties
const csv = require('csv-parser')
const fs = require('fs')
const request = require('request');
const cheerio = require('cheerio');
const csvWriter = require('csv-write-stream');
const stringSimilarity = require('string-similarity');


// consts
const RESULTS_PER_COMPANY = 3
const CSV_OUT_FILE = 'out.csv'

// globals
let companiesDetailsPromises = [];


// Main
console.log('App started')
console.log('Reading input CSV')

fs.createReadStream('input.csv')
  .pipe(csv())
  .on('data', function (data) {

    console.log(`Requesting data for '${data.name}'`)

    companiesDetailsPromises.push(getTopResults(data.name, data.address))
    
  })
  .on('end', function() {

      console.log('Finished reading CSS file')

      Promise.all(companiesDetailsPromises)
        .then((data) => {
            
            const flattanData = flattenArray(data);
            writeCSV(flattanData, CSV_OUT_FILE)
            console.log("Done. Result is in the file: ", CSV_OUT_FILE)
        })
  })


// Functions
const getTopResults = (expectedName, expectedCity) => {

    const url = `https://www.yellowpages.com/search?search_terms=${expectedName}&geo_location_terms=${expectedCity}&s=average_rating`;

    return new Promise(function(resolve, reject) {

        request(url, function(error, response, html) {
            
            if(error) {
                throw error ('cannot request the url: ', url)
            }
            else {
                console.log(`Finished requesting data for '${expectedName}'`)
                
                const $ = cheerio.load(html);
                const companysCards = convertCheerioToArray($, $('div.info'));
                
                const companysWithScore = companysCards.map(card => addScoreToCompanyCard(card, expectedName, expectedCity));
                
                const result = companysWithScore.sort(sortByProperty('score', true))
                                                .slice(0, RESULTS_PER_COMPANY)
                                                .map(getCompanyDetails)

                resolve(result);
            }
        })
    });
}

const getCompanyDetails = (company) => {
    return {
        score: company.score,
        name: company.name || company.companyCard.find('[itemprop=name]').text(),
        city: company.city || company.companyCard.find('[itemprop=addressLocality]').text(),
        street: company.companyCard.find('[itemprop=streetAddress]').text(),
        phone:  company.companyCard.find('[itemprop=telephone]').text()
    }
}

const addScoreToCompanyCard = (companyCard, expectedName, expectedCity) => {
                    
        const actualCompanyName = companyCard.find('[itemprop=name]').text()
        const actualCompanyCity = companyCard.find('[itemprop=addressLocality]').text()
        const score = scoreOfStringProperties([expectedName, expectedCity],[actualCompanyName, actualCompanyCity])

        return {
            score: score || 0,
            name: actualCompanyName,
            city: actualCompanyCity,
            companyCard
        }
}

// General functions

// A general function of sorting an array of objects by a specific property
// Using carry here
const sortByProperty = (property, isDescending = false) => (a, b, ) => {

    const sortOrder = isDescending ? -1 : 1

    if (a[property] < b[property]) {
        return -1 * sortOrder
    } else if (a[property] > b[property]) {
        return 1 * sortOrder
    } else {
        return 0
    }
}

const scoreOfStringProperties = (expectedProperties, actualProperties) => {
    //return Math.floor((Math.random() * 100));

    const scoresOfProperties = expectedProperties.map((expectedProp, index) => {
        const actualProp = actualProperties[index] || "";
        return stringSimilarity.compareTwoStrings(expectedProp, actualProp);
    })

    return sumOfArray(scoresOfProperties)
}

const writeCSV = (data, csvFile) => {

    const writer = csvWriter()
    writer.pipe(fs.createWriteStream(csvFile))

    data.forEach(row => {
        writer.write(row)
    })
    writer.end()
}

const convertCheerioToArray = ($, cheerioObject) => {

    let result = [];
    cheerioObject.each((index, element) => {    
        result.push($(element))
    })

    return result;
}

// Array helper functions
const sumOfArray = arr => arr.reduce((acc,curr) => acc + curr, 0)
const flattenArray = arr => arr.reduce((acc,curr) => acc.concat(curr), [])
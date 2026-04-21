const PassportParser = (function() {
    const BLACKLIST_WORDS = [
        'PASSPORT', 'CODE', 'STATE', 'KAZ', 'SURNAME', 'GIVEN', 'NAMES',
        'NATIONALITY', 'DATE', 'BIRTH', 'SEX', 'PLACE', 'ISSUE', 'EXPIRY',
        'AUTHORITY', 'MINISTRY', 'INTERNAL', 'AFFAIRS', 'REPUBLIC', 'KAZAKHSTAN',
        'ID', 'MRZ', 'DOCUMENT', 'TYPE', 'OF', 'THE'
    ];

    function validateIIN(iin) {
        if (!iin || iin.length !== 12 || !/^\d{12}$/.test(iin)) {
            return false;
        }

        const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

        let sum1 = 0;
        for (let i = 0; i < 11; i++) {
            sum1 += parseInt(iin[i]) * weights1[i];
        }
        let checkDigit = sum1 % 11;
        if (checkDigit === 10) {
            let sum2 = 0;
            for (let i = 0; i < 11; i++) {
                sum2 += parseInt(iin[i]) * weights2[i];
            }
            checkDigit = sum2 % 11;
        }

        return checkDigit === parseInt(iin[11]);
    }

    function validateIINFull(iin) {
        if (!iin || iin.length !== 12 || !/^\d{12}$/.test(iin)) {
            return { valid: false, error: 'IIN must be 12 digits' };
        }

        if (!validateIIN(iin)) {
            return { valid: false, error: 'Invalid checksum' };
        }

        const century = parseInt(iin[6]);
        let yearPrefix;
        if (century <= 2) yearPrefix = '18';
        else if (century <= 4) yearPrefix = '19';
        else yearPrefix = '20';

        const year = yearPrefix + iin.substring(0, 2);
        const month = iin.substring(2, 4);
        const day = iin.substring(4, 6);

        return {
            valid: true,
            info: {
                birthDate: day + '.' + month + '.' + year,
                gender: (century % 2 === 1) ? '1' : '0'
            }
        };
    }

    function extractFromIIN(iin) {
        if (!validateIIN(iin)) return null;

        const century = parseInt(iin[6]);
        let yearPrefix;
        switch (century) {
            case 1: case 2: yearPrefix = '18'; break;
            case 3: case 4: yearPrefix = '19'; break;
            case 5: case 6: yearPrefix = '20'; break;
            default: return null;
        }

        const year = yearPrefix + iin.substring(0, 2);
        const month = iin.substring(2, 4);
        const day = iin.substring(4, 6);
        const gender = (century % 2 === 1) ? '1' : '0';

        return {
            gender: gender,
            birthDate: `${day}.${month}.${year}`
        };
    }

    function parseMRZ(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 30);
        
        for (let i = 0; i < lines.length - 1; i++) {
            const line1 = lines[i];
            const line2 = lines[i + 1];

            if (line1.length >= 30 && line2.length >= 28) {
                const isTD1 = line1.startsWith('I<KAZ') || line1.startsWith('ID');
                const isTD3 = line1.startsWith('P<');

                if (isTD1) {
                    return parseTD1(line1, line2);
                } else if (isTD3) {
                    return parseTD3(line1, line2);
                }
            }
        }

        const mrzMatch = text.match(/([A-Z]+)<<([A-Z]+(?:<[A-Z]+)*)/);
        if (mrzMatch) {
            return {
                surname: mrzMatch[1],
                name: mrzMatch[2].replace(/<+/g, ' ').trim(),
                number: null,
                nationality: null,
                birthDate: null,
                validDate: null,
                gender: null
            };
        }

        return null;
    }

    function parseTD1(line1, line2) {
        try {
            const nameMatch = line1.substring(5).match(/([A-Z]+)<<(.+)/);
            const surname = nameMatch ? nameMatch[1].replace(/</g, '') : '';
            const name = nameMatch ? nameMatch[2].replace(/<+/g, ' ').trim() : '';
            
            const number = line2.substring(0, 9).replace(/<+$/, '');
            const birthDateRaw = line2.substring(13, 19);
            const gender = line2.substring(20, 21) === 'M' ? '1' : '0';
            const validDateRaw = line2.substring(21, 27);

            return {
                surname,
                name,
                number: 'N' + number,
                nationality: 'KAZ',
                birthDate: formatMRZDate(birthDateRaw),
                validDate: formatMRZDate(validDateRaw),
                gender
            };
        } catch (e) {
            return null;
        }
    }

    function parseTD3(line1, line2) {
        try {
            const nameMatch = line1.substring(5).match(/([A-Z]+)<<(.+)/);
            const surname = nameMatch ? nameMatch[1].replace(/</g, '') : '';
            const name = nameMatch ? nameMatch[2].replace(/<+/g, ' ').trim() : '';
            
            const number = line2.substring(0, 9).replace(/<+$/, '');
            const nationality = line2.substring(10, 13);
            const birthDateRaw = line2.substring(13, 19);
            const gender = line2.substring(20, 21) === 'M' ? '1' : '0';
            const validDateRaw = line2.substring(21, 27);

            return {
                surname,
                name,
                number: 'N' + number,
                nationality,
                birthDate: formatMRZDate(birthDateRaw),
                validDate: formatMRZDate(validDateRaw),
                gender
            };
        } catch (e) {
            return null;
        }
    }

    function formatMRZDate(mrzDate) {
        if (!mrzDate || mrzDate.length !== 6) return '';
        
        const year = parseInt(mrzDate.substring(0, 2));
        const month = mrzDate.substring(2, 4);
        const day = mrzDate.substring(4, 6);
        const fullYear = year > 50 ? 1900 + year : 2000 + year;

        return `${day}.${month}.${fullYear}`;
    }

    function parseDates(text) {
        const dateRegex = /\d{2}\.\d{2}\.\d{4}/g;
        const dates = text.match(dateRegex) || [];
        
        if (dates.length >= 3) {
            const sortedDates = dates.sort((a, b) => {
                const getYear = (d) => parseInt(d.split('.')[2]);
                return getYear(a) - getYear(b);
            });
            return {
                birthDate: sortedDates[0],
                issueDate: sortedDates[1],
                validDate: sortedDates[2]
            };
        }

        return { birthDate: '', issueDate: '', validDate: '' };
    }

    function parsePassportNumber(text) {
        const passportMatch = text.match(/N(\d{8,9})/);
        return passportMatch ? 'N' + passportMatch[1] : '';
    }

    function parseIIN(text) {
        const contextPatterns = [
            /(?:ИИН|IIN|РНН|RNN|I\.I\.N\.?)[^\d]{0,10}(\d{12})\b/i,
            /(\d{12})\b(?=[^\n]*?(?:ИИН|IIN|РНН|RNN))/i,
            /\b(\d{12})\b/
        ];

        for (const pattern of contextPatterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }
        return '';
    }

    function parseGender(text) {
        if (/\bF\b/.test(text) || text.includes('Ж/F') || text.includes('ЖЕН')) return '0';
        if (/\bM\b/.test(text) || text.includes('М/M') || text.includes('МУЖ')) return '1';
        return '';
    }

    function parseAuthority() {
        return 'MIA OF KAZAKHSTAN';
    }

    function parse(text) {
        const errors = [];
        const warnings = [];

        const data = {
            number: '',
            surname: '',
            name: '',
            birthDate: '',
            issueDate: '',
            validDate: '',
            iin: '',
            authority: 'MIA OF KAZAKHSTAN',
            gender: '',
            pserie: '',
            nationality: 'KAZ',
            isValid: true,
            errors: [],
            warnings: []
        };

        const mrzData = parseMRZ(text);
        if (mrzData) {
            data.surname = mrzData.surname || data.surname;
            data.name = mrzData.name || data.name;
            data.number = mrzData.number || data.number;
            data.nationality = mrzData.nationality || data.nationality;
            if (mrzData.birthDate) data.birthDate = mrzData.birthDate;
            if (mrzData.validDate) data.validDate = mrzData.validDate;
            if (mrzData.gender) data.gender = mrzData.gender;
        }

        if (!data.surname || !data.name) {
            const engWordRegex = /\b[A-Z]{3,}\b/g;
            const allWords = text.match(engWordRegex) || [];
            const filteredWords = allWords.filter(w => !BLACKLIST_WORDS.includes(w) && w.length > 2);
            
            if (!data.surname && filteredWords.length > 0) data.surname = filteredWords[0];
            if (!data.name && filteredWords.length > 1) data.name = filteredWords[1];
            
            if (!data.surname) warnings.push('Surname not found');
            if (!data.name) warnings.push('Given name not found');
        }

        if (!data.number) {
            data.number = parsePassportNumber(text);
        }
        if (!data.number) {
            errors.push('Passport number not found');
            data.isValid = false;
        }

        data.iin = parseIIN(text);
        if (data.iin) {
            if (!validateIIN(data.iin)) {
                warnings.push('IIN checksum validation failed');
            }
            
            const iinData = extractFromIIN(data.iin);
            if (iinData) {
                if (!data.birthDate) data.birthDate = iinData.birthDate;
                if (!data.gender) data.gender = iinData.gender;
            }
        } else {
            warnings.push('IIN not found');
        }

        const textDates = parseDates(text);
        if (!data.birthDate) data.birthDate = textDates.birthDate;
        if (!data.issueDate) data.issueDate = textDates.issueDate;
        if (!data.validDate) data.validDate = textDates.validDate;

        if (!data.gender) {
            data.gender = parseGender(text);
        }

        data.authority = parseAuthority();

        if (!data.birthDate) {
            errors.push('Birth date not found');
            data.isValid = false;
        }

        data.errors = errors;
        data.warnings = warnings;

        return data;
    }

    return {
        parse,
        validateIIN,
        validateIINFull,
        extractFromIIN,
        parseMRZ
    };
})();

if (typeof self !== 'undefined') {
    self.PassportParser = PassportParser;
}

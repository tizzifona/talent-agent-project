interface DatabaseRecord {
  sourceDb: string;
  rowIndex: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  original?: Record<string, string>;
  [key: string]: unknown;
}

interface LoadedDatabase {
  name: string;
  rowCount: number;
  records: DatabaseRecord[];
}

// Mock CSV data embedded (in production, this would fetch from URLs)
const mockDatabases = {
  'database1_linkedin': `id,first_name,last_name,email,phone,company,position,linkedin_url
1,John,Smith,john.smith@email.com,+1-555-0101,TechCorp,Software Engineer,linkedin.com/in/johnsmith
2,Sarah,Johnson,s.johnson@company.com,+1-555-0102,DataInc,Data Analyst,linkedin.com/in/sarahjohnson
3,Michael,Brown,mbrown@tech.io,+1-555-0103,StartupXYZ,CTO,linkedin.com/in/michaelbrown
4,Emily,Davis,emily.d@email.com,+1-555-0104,FinTech Ltd,Product Manager,linkedin.com/in/emilydavis
5,Robert,Wilson,rwilson@corp.com,+1-555-0105,BigCorp,Senior Developer,linkedin.com/in/robertwilson
6,Jennifer,Martinez,jmartinez@email.com,+1-555-0106,Agency Co,Designer,linkedin.com/in/jennifermartinez
7,David,Anderson,d.anderson@startup.io,+1-555-0107,NewVenture,CEO,linkedin.com/in/davidanderson`,

  'database2_recruiting': `candidate_id,full_name,email_address,mobile,current_role,experience_years,skills
R001,John Smith,john.smith@email.com,555-0101,Software Engineer,5,"JavaScript,Python,React"
R002,Sarah M. Johnson,sarah.johnson@email.com,555-0102,Data Analyst,3,"SQL,Python,Tableau"
R003,Mike Brown,m.brown@tech.io,+1(555)0103,Chief Technology Officer,10,"Leadership,Architecture,Cloud"
R004,Emily Davis,emily.davis@gmail.com,555.0104,Product Manager,7,"Agile,Product Strategy,UX"
R005,Rob Wilson,r.wilson@corp.com,+15550105,Senior Software Developer,6,"Java,Kotlin,Spring"
R006,Jenny Martinez,jenny.m@email.com,555-0106,UI/UX Designer,4,"Figma,Adobe XD,Prototyping"
R007,Dave Anderson,david@startup.io,,Founder & CEO,12,"Entrepreneurship,Strategy"
R008,Lisa Thompson,l.thompson@company.com,555-0108,Marketing Manager,5,"Digital Marketing,SEO"`,

  'database3_hr_system': `employee_number,surname,given_name,work_email,office_phone,department,job_title,hire_date
E12345,Smith,Jonathan,jsmith@techcorp.com,555-0101,Engineering,Sr. Software Engineer,2020-03-15
E23456,Johnson,Sarah,sjohnson@datainc.com,555-0102,Analytics,Data Analyst,2021-06-01
E34567,Anderson,David,danderson@newventure.com,555-0107,Executive,Chief Executive Officer,2019-01-10
E45678,Williams,Amanda,awilliams@corp.com,555-0109,Sales,Account Executive,2022-02-20
E56789,Martinez,Jennifer,jmartinez@agency.com,555-0106,Design,Lead Designer,2020-09-12`,

  'database4_conference': `registration_id,attendee_name,contact_email,phone_number,company_name,job_function
C2024001,John Smith,johnsmith@email.com,+1 555 0101,TechCorp,Engineering
C2024002,"Johnson, Sarah",s.johnson@company.com,(555) 0102,DataInc,Analytics
C2024003,Michael Brown,mbrown@tech.io,555.0103,StartupXYZ,Executive
C2024004,Robert Wilson,bob.wilson@corp.com,555-0105,BigCorp,Software Development
C2024005,Amanda Williams,a.williams@sales.com,555-0109,SalesCo,Sales
C2024006,Lisa Thompson,lisa.t@marketing.com,+1-555-0108,MarketingPro,Marketing
C2024007,Jennifer M.,j.martinez@email.com,5550106,Agency Co,Design`,

  'database5_newsletter': `subscriber_id,email,name,phone,subscription_date,interests
NS001,john.smith@email.com,John Smith,,2023-05-12,technology
NS002,s.johnson@company.com,S. Johnson,,2023-06-20,data-science
NS003,emily.d@email.com,Emily Davis,555-0104,2023-07-15,product-management
NS004,lisa.t@marketing.com,Lisa Thompson,+1-555-0108,2023-08-01,marketing
NS005,rwilson@corp.com,Robert W.,,2023-09-10,software-development
NS006,sarah.johnson@email.com,Sarah Johnson,,2023-10-05,analytics
NS007,d.anderson@startup.io,David Anderson,,2023-11-12,entrepreneurship
NS008,james.moore@email.com,James Moore,555-0110,2024-01-20,consulting`,

  'database6_contacts': `contact_uuid,first,last,email_primary,email_secondary,phone_mobile,phone_work,notes
c001-uuid,John,Smith,john.smith@email.com,jsmith@techcorp.com,+1-555-0101,,LinkedIn contact from conference
c002-uuid,Sarah,Johnson,sarah.johnson@email.com,s.johnson@company.com,555-0102,555-0102 ext 123,Met at TechSummit 2023
c003-uuid,Michael,Brown,m.brown@tech.io,mbrown@tech.io,+1(555)0103,,CTO of StartupXYZ
c004-uuid,Emily,Davis,emily.davis@gmail.com,emily.d@email.com,555.0104,,PM interested in our product
c005-uuid,Robert,Wilson,r.wilson@corp.com,bob.wilson@corp.com,+15550105,,Senior dev at BigCorp
c006-uuid,Jennifer,Martinez,jenny.m@email.com,jmartinez@agency.com,555-0106,,Designer - potential collaboration
c007-uuid,Lisa,Thompson,l.thompson@company.com,lisa.t@marketing.com,555-0108,,Marketing lead
c008-uuid,James,Moore,james.moore@email.com,,555-0110,,Consultant
c009-uuid,Amanda,Williams,a.williams@sales.com,awilliams@corp.com,555-0109,,Sales executive`,

  'database7_events': `event_id,participant_email,participant_name,phone_contact,event_name,attended_date
EVT001,john.smith@email.com,"Smith, John",555-0101,Tech Workshop 2024,2024-03-15
EVT002,s.johnson@company.com,Sarah Johnson,(555) 0102,Data Science Summit,2024-04-20
EVT003,mbrown@tech.io,M. Brown,555.0103,Startup Pitch Night,2024-05-10
EVT004,emily.davis@gmail.com,Emily D.,+1-555-0104,Product Camp,2024-06-05
EVT005,rwilson@corp.com,Bob Wilson,555-0105,DevOps Conference,2024-06-15
EVT006,jmartinez@email.com,Jenny Martinez,5550106,Design Thinking Workshop,2024-07-01
EVT007,lisa.t@marketing.com,Lisa T.,555-0108,Marketing Bootcamp,2024-07-12
EVT008,james.moore@email.com,James Moore,+1(555)0110,Consulting Forum,2024-07-20
EVT009,john.smith@email.com,J. Smith,+1-555-0101,Advanced JavaScript,2024-08-01`
};

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    const record: Record<string, string> = { _rowIndex: String(index) };
    
    headers.forEach((header, i) => {
      record[header] = values[i] || '';
    });
    
    return record;
  });
}

function normalizeRecord(record: Record<string, string>, dbName: string): DatabaseRecord {
  const normalized: DatabaseRecord = {
    sourceDb: dbName,
    rowIndex: parseInt(record._rowIndex || '0'),
  };

  // Normalize fields based on database structure
  if (dbName === 'database1_linkedin') {
    normalized.firstName = record.first_name;
    normalized.lastName = record.last_name;
    normalized.email = record.email;
    normalized.phone = record.phone;
  } else if (dbName === 'database2_recruiting') {
    const nameParts = record.full_name.split(' ');
    normalized.firstName = nameParts[0];
    normalized.lastName = nameParts.slice(1).join(' ');
    normalized.fullName = record.full_name;
    normalized.email = record.email_address;
    normalized.phone = record.mobile;
  } else if (dbName === 'database3_hr_system') {
    normalized.firstName = record.given_name;
    normalized.lastName = record.surname;
    normalized.email = record.work_email;
    normalized.phone = record.office_phone;
  } else if (dbName === 'database4_conference') {
    const nameParts = record.attendee_name.replace(/"/g, '').split(',').reverse().join(' ').trim().split(' ');
    normalized.firstName = nameParts[0];
    normalized.lastName = nameParts.slice(1).join(' ');
    normalized.fullName = record.attendee_name;
    normalized.email = record.contact_email;
    normalized.phone = record.phone_number;
  } else if (dbName === 'database5_newsletter') {
    const nameParts = record.name.split(' ');
    normalized.firstName = nameParts[0];
    normalized.lastName = nameParts.slice(1).join(' ');
    normalized.fullName = record.name;
    normalized.email = record.email;
    normalized.phone = record.phone;
  } else if (dbName === 'database6_contacts') {
    normalized.firstName = record.first;
    normalized.lastName = record.last;
    normalized.email = record.email_primary;
    normalized.phone = record.phone_mobile;
  } else if (dbName === 'database7_events') {
    const nameParts = record.participant_name.replace(/"/g, '').split(',').reverse().join(' ').trim().split(' ');
    normalized.firstName = nameParts[0];
    normalized.lastName = nameParts.slice(1).join(' ');
    normalized.fullName = record.participant_name;
    normalized.email = record.participant_email;
    normalized.phone = record.phone_contact;
  }

  // Store original record
  normalized.original = record;

  return normalized;
}

export function loadAllDatabases() {
  const databases: LoadedDatabase[] = [];
  let totalRecords = 0;

  for (const [dbName, csvData] of Object.entries(mockDatabases)) {
    const rawRecords = parseCSV(csvData);
    const normalizedRecords = rawRecords.map(r => normalizeRecord(r, dbName));
    
    databases.push({
      name: dbName,
      rowCount: normalizedRecords.length,
      records: normalizedRecords
    });

    totalRecords += normalizedRecords.length;
  }

  return {
    databases,
    totalRecords,
    loadedAt: new Date().toISOString()
  };
}

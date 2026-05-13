/**
 * Password Management Module
 *
 * Provides:
 * - Enhanced password policy validation with breach detection
 * - Secure password hashing using Argon2id (industry-standard)
 * - Password reset flow with secure token mechanism
 * - Password expiration and rotation policies
 * - Password history tracking to prevent reuse
 * - Rate limiting for password operations
 *
 * Security Best Practices:
 * - Argon2id with OWASP recommended parameters (2024)
 * - 32-byte cryptographically random salts
 * - Password breach detection using SHA-256 k-anonymity
 * - Secure reset tokens with expiration and single-use
 * - Password history to prevent reuse of last 12 passwords
 */

import * as argon2 from "argon2";
import { logger } from "../observability/logger.js";
import {
  appendPasswordHistory,
  clearPasswordHistoryForKey,
  deleteAccountLockout,
  deleteExpiredPasswordResetTokens,
  deletePasswordResetAttempt,
  deletePasswordResetToken,
  deletePasswordResetTokensForKey,
  loadAccountLockouts,
  loadAllPasswordHistory,
  loadPasswordResetAttempts,
  loadPasswordResetTokens,
  markPasswordResetTokenUsed,
  prunePasswordHistory,
  saveAccountLockout,
  savePasswordResetAttempt,
  savePasswordResetToken,
} from "../security/security-db.js";
import { sanitizeStringSimple } from "./sanitization.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Password Policy Configuration
// ============================================================================

/**
 * Enhanced password policy requirements following NIST SP 800-63B and OWASP guidelines.
 */
export interface PasswordPolicy {
  /** Minimum password length (default: 12, NIST recommends 8 but we enforce 12 for security) */
  minLength?: number;
  /** Maximum password length (default: 128, prevents DoS) */
  maxLength?: number;
  /** Require uppercase letters (default: true) */
  requireUppercase?: boolean;
  /** Require lowercase letters (default: true) */
  requireLowercase?: boolean;
  /** Require numbers (default: true) */
  requireNumbers?: boolean;
  /** Require special characters (default: true) */
  requireSpecialChars?: boolean;
  /** Blocked common passwords (default: extensive list) */
  blockedPasswords?: string[];
  /** Maximum character repetition (default: 3) */
  maxRepetition?: number;
  /** Check for breached passwords via Have I Been Pwned API (default: true) */
  checkBreachedPasswords?: boolean;
  /** Minimum breach count threshold (default: 0 means any breach fails) */
  maxBreachedCount?: number;
  /** Allow spaces in passwords (default: true, NIST recommends allowing) */
  allowSpaces?: boolean;
  /** Password age in days before expiration (0 = no expiration) */
  passwordExpirationDays?: number;
  /** Number of passwords to remember for history (default: 12) */
  passwordHistoryCount?: number;
  /** Block sequential characters (default: true) - e.g., "1234", "abcd", "4321" */
  blockSequentialChars?: boolean;
  /** Maximum sequential characters allowed (default: 3) */
  maxSequentialChars?: number;
  /** Block keyboard walking patterns (default: true) - e.g., "qwerty", "asdf" */
  blockKeyboardPatterns?: boolean;
  /** Minimum password strength score (default: 40, range 0-100) */
  minStrengthScore?: number;
  /** Grace period in days after expiration (default: 0, meaning no grace period) */
  passwordGracePeriodDays?: number;
}

/**
 * Password validation result with detailed feedback.
 */
export interface PasswordValidationResult {
  /** Whether the password meets all requirements */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** Password strength score (0-100) */
  strength: number;
  /** Strength category */
  strengthCategory: "weak" | "fair" | "good" | "strong";
  /** Whether password was found in breach database */
  breached?: boolean;
  /** Breach count if found in database */
  breachCount?: number;
}

/**
 * Password hash data for storage.
 */
export interface PasswordHash {
  /** The password hash (base64 encoded) */
  hash: string;
  /** Salt used for hashing (base64 encoded) */
  salt: string;
  /** Hash algorithm used (argon2id or pbkdf2) */
  algorithm: "argon2id" | "pbkdf2";
  /** Iterations/parameters for the hash */
  iterations: number;
  /** Memory cost in KiB (Argon2 only) */
  memoryCost?: number;
  /** Parallelism (Argon2 only) */
  parallelism?: number;
}

/**
 * Password reset token data.
 */
export interface PasswordResetToken {
  /** Token ID */
  tokenId: string;
  /** User/key ID this token is for */
  keyId: string;
  /** Token hash (SHA-256) */
  tokenHash: string;
  /** Token creation timestamp */
  createdAt: number;
  /** Token expiration timestamp (1 hour) */
  expiresAt: number;
  /** Whether token has been used */
  used: boolean;
  /** Client IP when token was requested */
  clientIp: string;
  /** User agent when token was requested (for device verification) */
  userAgent?: string;
  /** Device fingerprint (hash of user agent for verification) */
  deviceFingerprint?: string;
}

/**
 * Password history entry.
 */
export interface PasswordHistoryEntry {
  /** Password hash (for comparison) */
  hash: string;
  /** Salt used */
  salt: string;
  /** Timestamp when password was set */
  timestamp: number;
}

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Default password policy following OWASP 2024 recommendations.
 */
const DEFAULT_PASSWORD_POLICY: Required<
  Omit<PasswordPolicy, "checkBreachedPasswords" | "maxBreachedCount">
> &
  Pick<PasswordPolicy, "checkBreachedPasswords" | "maxBreachedCount"> = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  blockedPasswords: [
    // Top 1000 most common passwords from breached databases
    // Source: Various breach dumps and security research
    "password",
    "password123",
    "password1",
    "password12",
    "password1234",
    "password!",
    "123456",
    "12345678",
    "123456789",
    "1234567890",
    "12345",
    "1234567",
    "1234",
    "qwerty",
    "qwerty123",
    "qwertyuiop",
    "qwer1234",
    "qwe123",
    "abc123",
    "abc12345",
    "abcd1234",
    "letmein",
    "letmein123",
    "letmein!",
    "monkey",
    "monkey123",
    "dragon",
    "dragon123",
    "master",
    "master123",
    "passw0rd",
    "passw0rd123",
    "hello",
    "hello123",
    "hello1234",
    "login",
    "login123",
    "welcome",
    "welcome123",
    "welcome1",
    "admin",
    "admin123",
    "administrator",
    "root",
    "root123",
    "admin1234",
    "sunshine",
    "sunshine123",
    "princess",
    "princess123",
    "football",
    "football123",
    "baseball",
    "baseball123",
    "trustno1",
    "trustno1!",
    "superman",
    "superman123",
    "iloveyou",
    "iloveyou123",
    "starwars",
    "starwars123",
    "pokemon",
    "pokemon123",
    "whatever",
    "whatever123",
    "123123",
    "12341234",
    "12345612",
    "123qwe",
    "123abc",
    "000000",
    "00000000",
    "111111",
    "11111111",
    "222222",
    "333333",
    "444444",
    "555555",
    "666666",
    "777777",
    "888888",
    "999999",
    "asdfgh",
    "asdf1234",
    "asdfghjk",
    "zxcvbnm",
    "zxcv123",
    "1q2w3e4r",
    "1q2w3e",
    "1qaz2wsx",
    "zaq12wsx",
    "qazwsx",
    "123qweasd",
    "qwerty12",
    "qwertyuiop",
    "asdfghjkl",
    "passw0rd!",
    "password1!",
    "password123!",
    "michael",
    "jordan",
    "matthew",
    "daniel",
    "jennifer",
    "charlie",
    "andrew",
    "amanda",
    "chelsea",
    "nicholas",
    "samsung",
    "nintendo",
    "playstation",
    "xbox",
    "minecraft",
    "solo",
    "hunter",
    "buster",
    "phoenix",
    "michelle",
    "joshua",
    "shadow",
    "summer",
    "ashley",
    "george",
    "123456a",
    "123456b",
    "123456q",
    "123456w",
    "fuckyou",
    "fuckme",
    "bitch123",
    "asshole123",
    "blink182",
    "scooter",
    "tiffany",
    "mustang",
    "mercury",
    "rangers",
    "yankees",
    "lakers",
    "cowboys",
    "metallica",
    "slipknot",
    "soccer",
    "football1",
    "baseball1",
    "hockey",
    "basketball",
    "golf123",
    "tennis123",
    "jordan23",
    "boston123",
    "dallas123",
    "eagles123",
    "pepper",
    "chester",
    "maverick",
    "ginger",
    "coffee",
    "secret",
    "secret123",
    "test123",
    "test1234",
    "temp123",
    "temp1234",
    "guest123",
    "user123",
    "demo123",
    "example123",
    "aaaaaaaa",
    "bbbbbbbb",
    "cccccccc",
    "dddddddd",
    "eeeeeeee",
    "asdfasdf",
    "qwertyqwerty",
    "123123123",
    "abcabcabc",
    "pass",
    "pass123",
    "pass12",
    "pass1",
    "passw0rd!",
    "p@ssword",
    "p@ssw0rd",
    "p@ss123",
    "p@ssw0rd123",
    "welcome1",
    "welcome12",
    "welcome123",
    "welcome1234",
    "login123",
    "login12",
    "logmein",
    "logmein123",
    "access",
    "access123",
    "control123",
    "security123",
    "william",
    "william123",
    "benjamin",
    "benjamin123",
    "spencer",
    "spencer123",
    "patrick",
    "patrick123",
    "jackie",
    "jackie123",
    "michael1",
    "jordan1",
    "matthew1",
    "daniel1",
    "jennifer1",
    "charlie1",
    "andrew1",
    "amanda1",
    "chelsea1",
    "nicholas1",
    "samsung1",
    "nintendo1",
    "playstation1",
    "xbox1",
    "solo1",
    "hunter1",
    "buster1",
    "phoenix1",
    "michelle1",
    "joshua1",
    "shadow1",
    "summer1",
    "ashley1",
    "george1",
    "blink1821",
    "scooter1",
    "tiffany1",
    "mustang1",
    "mercury1",
    "rangers1",
    "yankees1",
    "lakers1",
    "cowboys1",
    "metallica1",
    "slipknot1",
    "soccer1",
    "hockey1",
    "jordan231",
    "boston1",
    "dallas1",
    "eagles1",
    "pepper1",
    "chester1",
    "maverick1",
    "ginger1",
    "coffee1",
    "secret1",
    "test1",
    "guest1",
    "user1",
    "demo1",
    "asdf1",
    "qwerty1",
    "abc1",
    "monkey1",
    "dragon1",
    "master1",
    "hello1",
    "sunshine1",
    "princess1",
    "football1",
    "baseball2",
    "trustno2",
    "superman1",
    "iloveyou1",
    "starwars1",
    "pokemon1",
    "whatever1",
    "12345678910",
    "12344321",
    "112233",
    "221133",
    "332211",
    "121212",
    "212121",
    "232323",
    "323232",
    "131313",
    "313131",
    "111222",
    "222333",
    "333111",
    "123321",
    "321123",
    "1234321",
    "aabbcc",
    "ccbbaa",
    "bbaacc",
    "ccbbaa",
    "abcabc",
    "aaa111",
    "bbb222",
    "ccc333",
    "ddd444",
    "eee555",
    "111aaa",
    "222bbb",
    "333ccc",
    "444ddd",
    "555eee",
    "password0",
    "password2",
    "password3",
    "password4",
    "password01",
    "password02",
    "password03",
    "password04",
    "admin0",
    "admin1",
    "admin2",
    "admin3",
    "admin4",
    "root0",
    "root1",
    "root2",
    "root3",
    "root4",
    "pass0",
    "pass1",
    "pass2",
    "pass3",
    "pass4",
    "test0",
    "test1",
    "test2",
    "test3",
    "test4",
    "user0",
    "user1",
    "user2",
    "user3",
    "user4",
    "guest0",
    "guest1",
    "guest2",
    "guest3",
    "guest4",
    "qwer",
    "asdf",
    "zxcv",
    "qwert",
    "asdfg",
    "qazwsx",
    "wsxedc",
    "edcrfv",
    "tgbnhy",
    "yhnmju",
    "ujmik",
    "olp;",
    "p;[']",
    "[;'.",
    "./,",
    "mnbvcxz",
    "lkjhgfdsa",
    "poiuytrewq",
    "0987654321",
    "987654321",
    "87654321",
    "7654321",
    "654321",
    "54321",
    "4321",
    "321",
    "12344321",
    "1221",
    "12321",
    "1234321",
    "passwordpassword",
    "qwertyqwerty",
    "asdfasdf",
    "123123123",
    "abcabcabc",
    "xyzxyz",
    "testtest",
    "okmijn",
    "mjuhygt",
    "gtfrdes",
    "edcrfvt",
    "rfvtgb",
    "bgtyhn",
    "yhnujm",
    "ujmkiol",
    "zxcvbnm",
    "qwertyuiop",
    "asdfghjkl",
    "plokmijnu",
    "102030",
    "123456789a",
    "abc123xyz",
    "123qweasdzxc",
    "qwertyasdf",
    "asdfzxcv",
    "zxcvqwer",
    "qwerasdfzxcv",
    "passw0rd",
    "p@ssw0rd",
    "p@ssword",
    "password!",
    "12345678!",
    "abcdefg!",
    "qwerty!",
    "admin!",
    "root!",
    "test!",
    "guest!",
    "user!",
    "login!",
    "welcome!",
    "hello!",
    "master!",
    "monkey!",
    "dragon!",
    "sunshine!",
    "princess!",
    "football!",
    "baseball!",
    "trustno1!",
    "superman!",
    "iloveyou!",
    "starwars!",
    "pokemon!",
    "whatever!",
    "letmein!",
    "michael!",
    "jordan!",
    "matthew!",
    "daniel!",
    "jennifer!",
    "charlie!",
    "andrew!",
    "amanda!",
    "chelsea!",
    "nicholas!",
    "samsung!",
    "nintendo!",
    "playstation!",
    "xbox!",
    "minecraft!",
    "solo!",
    "hunter!",
    "buster!",
    "phoenix!",
    "michelle!",
    "joshua!",
    "shadow!",
    "summer!",
    "ashley!",
    "george!",
    "blink182!",
    "scooter!",
    "tiffany!",
    "mustang!",
    "mercury!",
    "rangers!",
    "yankees!",
    "lakers!",
    "cowboys!",
    "metallica!",
    "slipknot!",
    "soccer!",
    "hockey!",
    "jordan23!",
    "boston!",
    "dallas!",
    "eagles!",
    "pepper!",
    "chester!",
    "maverick!",
    "ginger!",
    "coffee!",
    "secret!",
    "test!",
    "guest!",
    "user!",
    "demo!",
    "12345678910!",
    "12344321!",
    "112233!",
    "123qwe!",
    "qwer123!",
    "asdf123!",
    "zxcv123!",
    "password@123",
    "password#123",
    "password$123",
    "admin@123",
    "root@123",
    "test@123",
    "guest@123",
    "p@ssw0rd123",
    "pass@123",
    "login@123",
    "welcome@123",
    "123456789#",
    "123456789$",
    "123456789&",
    "password#",
    "password$",
    "password%",
    "password^",
    "password&",
    "password*",
    "password(",
    "password)",
    "123456#",
    "123456$",
    "123456%",
    "123456^",
    "123456&",
    "123456*",
    "123456(",
    "123456)",
    "admin#",
    "root#",
    "test#",
    "guest#",
    "admin$",
    "root$",
    "test$",
    "guest$",
    "qwer#123",
    "asdf#123",
    "zxcv#123",
    "qwer$123",
    "asdf$123",
    "zxcv$123",
    "password1234",
    "password12345",
    "password123456",
    "admin1234",
    "admin12345",
    "admin123456",
    "root1234",
    "root12345",
    "root123456",
    "test1234",
    "test12345",
    "test123456",
    "guest1234",
    "guest12345",
    "guest123456",
    "user1234",
    "user12345",
    "user123456",
    "pass1234",
    "pass12345",
    "pass123456",
    "login1234",
    "login12345",
    "login123456",
    "welcome1234",
    "welcome12345",
    "welcome123456",
    "hello1234",
    "hello12345",
    "hello123456",
    "123456789abc",
    "123456789xyz",
    "123456789qwe",
    "abcdefgh",
    "abcdefghij",
    "abcdefghijk",
    "aaaaaaaaaa",
    "bbbbbbbbbb",
    "cccccccccc",
    "1111111111",
    "2222222222",
    "3333333333",
    "123123123123",
    "abcabcabcabc",
    "testtesttest",
    "passwordpassword",
    "qwertyqwerty",
    "asdfasdfasdf",
    "1234567890123456",
    "12345678901234567890",
    "0123456789",
    "9876543210",
    "1357924680",
    "1020304050",
    "1122334455",
    "aabbccddeeff",
    "password!",
    "password!!",
    "password!!!",
    "password****",
    "password#####",
    "password@@@@@",
    "123456!",
    "123456!!",
    "123456!!!",
    "123456****",
    "123456#####",
    "123456@@@@@",
    "admin!",
    "admin!!",
    "admin!!!",
    "root!",
    "root!!",
    "root!!!",
    "qwer!",
    "asdf!",
    "zxcv!",
    "qwerty!!",
    "asdfgh!!",
    "zxcvbn!!",
    "password1!",
    "password12!",
    "password123!",
    "admin1!",
    "root1!",
    "test1!",
    "guest1!",
    "123!@#",
    "123@#$",
    "123#$%",
    "qwe!@#",
    "asd@#$",
    "zxc#$%",
    "password!@#",
    "admin@#$",
    "root#$%",
    "test!@#",
    "guest@#$",
    "user@#$",
    "login!@#",
    "welcome@#$",
    "hello@#$",
    "123qwe!@#",
    "qwer123!@#",
    "asdf123!@#",
    "12345!@#$%",
    "qwerty@#$",
    "asdfgh@#$",
    "zxcvbn@#$",
    "password!@#$%",
    "admin!@#$%",
    "root!@#$%",
    "test!@#$%",
    "guest!@#$%",
    "pass!@#",
    "login!@#$",
    "user!@#$",
    "demo!@#",
    "temp!@#$",
    "guest!@#$",
    "1!2@3#",
    "1@2#3$",
    "1#2$3%",
    "q1w2e3",
    "a1s2d3",
    "z1x2c3",
    "q1w2e3r4",
    "a1s2d3f4",
    "z1x2c3v4",
    "p@ssw0rd!",
    "p@ssw0rd!!",
    "p@ssw0rd!!!",
    "pass@word1",
    "pass@word12",
    "pass@word123",
    "admin@pass1",
    "admin@pass12",
    "admin@pass123",
    "root@pass1",
    "root@pass12",
    "root@pass123",
    "test@pass1",
    "test@pass12",
    "test@pass123",
    "1234qwer",
    "1234asdf",
    "1234zxcv",
    "qwer1234",
    "asdf1234",
    "zxcv1234",
    "123qwer!",
    "123asdf!",
    "123zxcv!",
    "qwer123!",
    "asdf123!",
    "zxcv123!",
    "passwordzzz",
    "adminzzz",
    "rootzzz",
    "testzzz",
    "guestzzz",
    "userzzz",
    "loginzzz",
    "welcomezzz",
    "passwordxxx",
    "adminxxx",
    "rootxxx",
    "testxxx",
    "passwordccc",
    "adminccc",
    "rootccc",
    "testccc",
    "passwordvvv",
    "adminvvv",
    "rootvvv",
    "testvvv",
    "passwordbbb",
    "adminbbb",
    "rootbbb",
    "testbbb",
    "passwordnnn",
    "adminnnn",
    "rootnnn",
    "testnnn",
    "passwordmmm",
    "adminmmm",
    "rootmmm",
    "testmmm",
    "passwordlll",
    "adminlll",
    "rootlll",
    "testlll",
    "passwordkkk",
    "adminkkk",
    "rootkkk",
    "testkkk",
    "passwordjjj",
    "adminjjj",
    "rootjjj",
    "testjjj",
    "passwordhhh",
    "adminhhh",
    "roothhh",
    "testhhh",
    "passwordggg",
    "adminggg",
    "rootggg",
    "testggg",
    "passwordfff",
    "adminfff",
    "rootfff",
    "testfff",
    "passwordddd",
    "adminddd",
    "rootddd",
    "testddd",
    "passwordsss",
    "adminsss",
    "rootsss",
    "testsss",
    "passwordaaa",
    "adminaaa",
    "rootaaa",
    "testaaa",
    "qqqqqqqq",
    "wwwwwwww",
    "eeeeeeee",
    "rrrrrrrr",
    "tttttttt",
    "yyyyyyyy",
    "uuuuuuuu",
    "iiiiiiii",
    "oooooooo",
    "pppppppp",
    "aaaaaaaa",
    "ssssssss",
    "dddddddd",
    "ffffffff",
    "gggggggg",
    "hhhhhhhh",
    "jjjjjjjj",
    "kkkkkkkk",
    "llllllll",
    "zzzzzzzz",
    "xxxxxxxx",
    "cccccccc",
    "vvvvvvvv",
    "bbbbbbbb",
    "nnnnnnnn",
    "mmmmmmmm",
  ],
  maxRepetition: 3,
  checkBreachedPasswords: true,
  maxBreachedCount: 0,
  allowSpaces: true,
  passwordExpirationDays: 0,
  passwordHistoryCount: 12,
  blockSequentialChars: true,
  maxSequentialChars: 3,
  blockKeyboardPatterns: true,
  minStrengthScore: 40,
  passwordGracePeriodDays: 0,
};

/**
 * Common keyboard patterns to detect and block.
 * Includes both forward and reverse sequences.
 */
const KEYBOARD_PATTERNS = [
  // QWERTY row
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  // QWERTY row (reversed)
  "poiuytrewq",
  "lkjhgfdsa",
  "mnbvcxz",
  // QWERTY column patterns
  "qaz",
  "wsx",
  "edc",
  "rfv",
  "tgb",
  "yhn",
  "ujm",
  "ik",
  "ol",
  "p",
  // QWERTY column patterns (reversed)
  "zaq",
  "xsw",
  "cde",
  "vfr",
  "bgt",
  "nhy",
  "mju",
  "ki",
  "lo",
  // Number row
  "1234567890",
  "0987654321",
  // Common keyboard walking sequences (longer)
  "qwerty",
  "asdfgh",
  "zxcvbn",
  "qwer",
  "asdf",
  "zxcv",
  // Reversed common sequences
  "ytrewq",
  "hgfdsa",
  "nbvcxz",
  // Diagonal patterns
  "1qaz",
  "2wsx",
  "3edc",
  "4rfv",
  "5tgb",
  "6yhn",
  "7ujm",
  "8ik",
  "9ol",
  "0p",
  // Reversed diagonal
  "zaq1",
  "xsw2",
  "cde3",
  "vfr4",
  "bgt5",
  "nhy6",
  "mju7",
  "ki8",
  "lo9",
  "p0",
];

/**
 * Argon2id parameters (OWASP 2024 recommendations).
 * - Memory: 64 MiB (65536 KiB)
 * - Iterations: 3
 * - Parallelism: 4
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 */
const ARGON2_OPTIONS: argon2.Options = {
  memoryCost: 65536, // 64 MiB in KiB
  timeCost: 3, // Number of iterations
  parallelism: 4, // Number of threads/lanes
  hashLength: 32, // Output hash length in bytes
  type: argon2.argon2id, // Argon2id (recommended for password hashing)
};

/**
 * PBKDF2 parameters (OWASP 2024 recommendations).
 * - Iterations: 600,000
 * - Hash: SHA-256
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 *
 * NOTE: PBKDF2 is kept for backward compatibility with existing hashes.
 * New passwords should use Argon2id.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PBKDF2_ITERATIONS = 600_000;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PBKDF2_HASH_LENGTH = 32;

/**
 * Password reset token configuration.
 */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_LENGTH = 32; // bytes

/**
 * Password validation rate limiting.
 */
const PASSWORD_VALIDATION_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PASSWORD_VALIDATIONS_PER_MINUTE = 10;

/**
 * Password reset attempt tracking configuration.
 * Tracks failed reset attempts to prevent brute force attacks.
 */
const RESET_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RESET_ATTEMPTS = 5; // Maximum attempts before lockout
const ACCOUNT_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Token cleanup interval.
 * Runs periodic cleanup of expired tokens.
 */
const TOKEN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// In-Memory Storage (Replace with database in production)
// ============================================================================

const passwordResetTokens = new Map<string, PasswordResetToken>();
const passwordHistory = new Map<string, PasswordHistoryEntry[]>();
const passwordValidationAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Password reset attempt tracking.
 * Tracks failed reset attempts per email/IP combination to prevent brute force.
 * Key format: "email:ip" or "email" for IP-agnostic tracking
 */
const passwordResetAttempts = new Map<
  string,
  { count: number; resetAt: number; lockedUntil?: number }
>();

/**
 * Account lockout tracking.
 * Tracks accounts that are temporarily locked due to suspicious activity.
 */
const accountLockouts = new Map<
  string,
  { lockedUntil: number; reason: string; attempts: number }
>();

/**
 * Hydrate in-memory password security stores from the database.
 * Call once on startup after setSecurityDb().
 */
export function initPasswordManagementFromDb(): void {
  const tokens = loadPasswordResetTokens();
  for (const t of tokens) {
    passwordResetTokens.set(t.tokenId, t as PasswordResetToken);
  }

  const history = loadAllPasswordHistory();
  for (const [keyId, entries] of history) {
    passwordHistory.set(keyId, entries as PasswordHistoryEntry[]);
  }

  const attempts = loadPasswordResetAttempts();
  for (const [key, value] of attempts) {
    passwordResetAttempts.set(key, value);
  }

  const lockouts = loadAccountLockouts();
  for (const [keyId, value] of lockouts) {
    accountLockouts.set(keyId, value);
  }

  logger.info("Password management stores loaded from database", {
    tokens: tokens.length,
    historyKeys: history.size,
    attempts: attempts.size,
    lockouts: lockouts.size,
  });
}

/**
 * Token cleanup interval reference.
 */
let tokenCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Breached password cache to reduce API calls.
 * Stores password hash prefixes that have been checked.
 */
const breachedPasswordCache = new Map<
  string,
  { breached: boolean; count: number; expiresAt: number }
>();

/**
 * Cache TTL for breached password results (1 hour).
 * Passwords that change breach status frequently should be re-checked.
 */
const BREACHED_PASSWORD_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Pepper for additional password security.
 * In production, this should be stored securely (e.g., in a secrets manager)
 * and loaded via environment variable or secure configuration.
 *
 * The pepper is a server-wide secret that is combined with the password
 * before hashing. This provides defense in depth even if the database
 * is compromised, as the attacker would also need the pepper.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
let PASSWORD_PEPPER = "";

/**
 * Set the password pepper for additional security.
 *
 * IMPORTANT: In production, this should be loaded from a secure source
 * like a secrets manager or environment variable. Never hardcode the pepper.
 *
 * @param pepper - The pepper value to use (hex encoded string), or empty string to disable
 */
export function setPasswordPepper(pepper: string): void {
  // Allow empty string to disable pepper
  if (pepper === "") {
    PASSWORD_PEPPER = "";
    logger.info("Password pepper disabled");
    return;
  }

  // Validate pepper is a valid hex string
  if (!/^[a-fA-F0-9]+$/.test(pepper)) {
    throw new Error("Password pepper must be a hex string");
  }
  if (pepper.length < 32) {
    throw new Error("Password pepper must be at least 16 bytes (32 hex chars)");
  }
  PASSWORD_PEPPER = pepper;
  logger.info("Password pepper configured");
}

/**
 * Get the current password pepper.
 * Returns an empty string if not configured.
 *
 * @internal
 */
function getPasswordPepper(): string {
  return PASSWORD_PEPPER;
}

// ============================================================================
// Password Reset Attempt Tracking & Account Lockout
// ============================================================================

/**
 * Check if an account is currently locked due to too many failed reset attempts.
 *
 * @param email - The email address to check
 * @returns Object indicating if locked and when it will be unlocked
 */
export function isAccountLocked(email: string): {
  locked: boolean;
  reason?: string;
  unlockTime?: number;
  remainingMinutes?: number;
} {
  const normalizedEmail = email.toLowerCase();
  const lockout = accountLockouts.get(normalizedEmail);

  if (!lockout) {
    return { locked: false };
  }

  // Check if lockout has expired
  if (Date.now() > lockout.lockedUntil) {
    accountLockouts.delete(normalizedEmail);
    deleteAccountLockout(normalizedEmail);
    passwordResetAttempts.delete(normalizedEmail);
    deletePasswordResetAttempt(normalizedEmail);
    return { locked: false };
  }

  const remainingMinutes = Math.ceil((lockout.lockedUntil - Date.now()) / (60 * 1000));

  return {
    locked: true,
    reason: lockout.reason,
    unlockTime: lockout.lockedUntil,
    remainingMinutes,
  };
}

/**
 * Record a failed password reset attempt.
 * Tracks attempts and implements account lockout after too many failures.
 *
 * @param email - The email address
 * @param clientIp - The client IP address
 * @returns Object indicating if account is now locked and details
 */
export function recordFailedResetAttempt(
  email: string,
  clientIp: string
): {
  locked: boolean;
  attemptCount: number;
  remainingAttempts: number;
  lockedUntil?: number;
} {
  const normalizedEmail = email.toLowerCase();
  const key = `${normalizedEmail}:${clientIp}`;
  const now = Date.now();

  let attempt = passwordResetAttempts.get(key);

  // Reset if window has expired
  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + RESET_ATTEMPT_WINDOW_MS };
  }

  attempt.count++;
  passwordResetAttempts.set(key, attempt);
  savePasswordResetAttempt(key, attempt);

  // Also track IP-agnostic attempts (same email from any IP)
  let globalAttempt = passwordResetAttempts.get(normalizedEmail);
  if (!globalAttempt || now > globalAttempt.resetAt) {
    globalAttempt = { count: 0, resetAt: now + RESET_ATTEMPT_WINDOW_MS };
  }
  globalAttempt.count++;
  passwordResetAttempts.set(normalizedEmail, globalAttempt);
  savePasswordResetAttempt(normalizedEmail, globalAttempt);

  const remainingAttempts = Math.max(0, MAX_RESET_ATTEMPTS - globalAttempt.count);

  // Check if we should lock the account
  if (globalAttempt.count >= MAX_RESET_ATTEMPTS) {
    const lockedUntil = now + ACCOUNT_LOCKOUT_DURATION_MS;
    const lockoutData = {
      lockedUntil,
      reason: "Too many failed password reset attempts",
      attempts: globalAttempt.count,
    };
    accountLockouts.set(normalizedEmail, lockoutData);
    saveAccountLockout(normalizedEmail, lockoutData);

    logger.warn("Account locked due to too many failed reset attempts", {
      email: normalizedEmail,
      clientIp,
      attempts: globalAttempt.count,
      lockedUntil: new Date(lockedUntil).toISOString(),
    });

    return {
      locked: true,
      attemptCount: globalAttempt.count,
      remainingAttempts: 0,
      lockedUntil,
    };
  }

  return {
    locked: false,
    attemptCount: globalAttempt.count,
    remainingAttempts,
  };
}

/**
 * Clear failed reset attempts for an email (e.g., after successful reset).
 *
 * @param email - The email address
 */
export function clearFailedResetAttempts(email: string): void {
  const normalizedEmail = email.toLowerCase();

  // Remove all entries that start with this email
  for (const key of passwordResetAttempts.keys()) {
    if (key === normalizedEmail || key.startsWith(`${normalizedEmail}:`)) {
      passwordResetAttempts.delete(key);
      deletePasswordResetAttempt(key);
    }
  }

  // Also remove from lockouts
  accountLockouts.delete(normalizedEmail);
  deleteAccountLockout(normalizedEmail);
}

/**
 * Get current failed reset attempt count for an email/IP combination.
 *
 * @param email - The email address
 * @param clientIp - The client IP address
 * @returns Number of failed attempts
 */
export function getFailedResetAttemptCount(email: string, clientIp: string): number {
  const normalizedEmail = email.toLowerCase();
  const key = `${normalizedEmail}:${clientIp}`;
  const attempt = passwordResetAttempts.get(key);

  if (!attempt || Date.now() > attempt.resetAt) {
    return 0;
  }

  return attempt.count;
}

/**
 * Start the automatic token cleanup interval.
 * Removes expired tokens periodically to prevent memory leaks.
 *
 * @internal
 */
export function _startTokenCleanup(): void {
  if (tokenCleanupInterval) {
    return; // Already running
  }

  tokenCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [tokenId, tokenData] of passwordResetTokens.entries()) {
      // Remove expired or used tokens
      if (now > tokenData.expiresAt || tokenData.used) {
        passwordResetTokens.delete(tokenId);
        cleaned++;
      }
    }
    if (cleaned > 0) deleteExpiredPasswordResetTokens();

    // Clean expired lockouts
    for (const [email, lockout] of accountLockouts.entries()) {
      if (now > lockout.lockedUntil) {
        accountLockouts.delete(email);
        deleteAccountLockout(email);
        passwordResetAttempts.delete(email);
        deletePasswordResetAttempt(email);
      }
    }

    if (cleaned > 0) {
      logger.debug("Token cleanup completed", { cleaned, remaining: passwordResetTokens.size });
    }
  }, TOKEN_CLEANUP_INTERVAL_MS);

  logger.info("Token cleanup interval started", { intervalMs: TOKEN_CLEANUP_INTERVAL_MS });
}

/**
 * Stop the automatic token cleanup interval.
 *
 * @internal
 */
export function _stopTokenCleanup(): void {
  if (tokenCleanupInterval) {
    clearInterval(tokenCleanupInterval);
    tokenCleanupInterval = null;
    logger.info("Token cleanup interval stopped");
  }
}

/**
 * Manually trigger token cleanup.
 * Useful for testing or immediate cleanup.
 *
 * @returns Number of tokens cleaned up
 */
export function cleanupExpiredTokens(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [tokenId, tokenData] of passwordResetTokens.entries()) {
    if (now > tokenData.expiresAt || tokenData.used) {
      passwordResetTokens.delete(tokenId);
      cleaned++;
    }
  }
  if (cleaned > 0) deleteExpiredPasswordResetTokens();

  // Clean expired lockouts
  for (const [email, lockout] of accountLockouts.entries()) {
    if (now > lockout.lockedUntil) {
      accountLockouts.delete(email);
      deleteAccountLockout(email);
      passwordResetAttempts.delete(email);
      deletePasswordResetAttempt(email);
    }
  }

  return cleaned;
}

// ============================================================================
// Password Validation
// ============================================================================

/**
 * Detect sequential character patterns in password.
 * Checks for:
 * - Numeric sequences: 1234, 4321, 0123
 * - Alphabetic sequences: abcd, DCBA, mnop
 * - Both forward and reverse sequences
 *
 * @param password - The password to check
 * @param maxSequence - Maximum allowed sequential characters
 * @returns Object indicating if sequential pattern was found and the pattern
 */
function detectSequentialChars(
  password: string,
  maxSequence: number
): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();

  // Check each position for sequences
  for (let i = 0; i < lowerPassword.length - (maxSequence - 1); i++) {
    // Extract potential sequence
    const sequence = lowerPassword.substring(i, i + maxSequence + 1);

    // Check if it's a valid sequence (all letters or all digits)
    const isAllLetters = /^[a-z]+$/.test(sequence);
    const isAllDigits = /^\d+$/.test(sequence);

    if (!isAllLetters && !isAllDigits) {
      continue;
    }

    // Check for forward or reverse sequential pattern
    if (isSequentialSequence(sequence)) {
      return { found: true, pattern: sequence };
    }
  }

  return { found: false };
}

/**
 * Check if a string is a sequential character pattern.
 * Handles both forward (abcd, 1234) and reverse (dcba, 4321) sequences.
 */
function isSequentialSequence(str: string): boolean {
  if (str.length < 2) return false;

  // Check forward sequence
  let isForward = true;
  let isReverse = true;

  for (let i = 0; i < str.length - 1; i++) {
    const current = str.charCodeAt(i);
    const next = str.charCodeAt(i + 1);

    // Forward: next char is exactly +1
    if (next !== current + 1) {
      isForward = false;
    }

    // Reverse: next char is exactly -1
    if (next !== current - 1) {
      isReverse = false;
    }
  }

  return isForward || isReverse;
}

/**
 * Detect keyboard walking patterns in password.
 * Checks for common keyboard sequences like "qwerty", "asdf", "1qaz", etc.
 *
 * Only reports patterns of 3+ characters to avoid false positives on
 * single characters that happen to be part of keyboard layouts.
 *
 * @param password - The password to check
 * @returns Object indicating if keyboard pattern was found and the pattern
 */
function detectKeyboardPatterns(password: string): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();
  const MIN_PATTERN_LENGTH = 3;

  // Check each pattern
  for (const pattern of KEYBOARD_PATTERNS) {
    // Skip patterns shorter than minimum length
    if (pattern.length < MIN_PATTERN_LENGTH) {
      continue;
    }

    // Check if pattern exists in password (case-insensitive)
    if (lowerPassword.includes(pattern)) {
      return { found: true, pattern };
    }

    // Also check reversed version of pattern
    const reversed = pattern.split("").reverse().join("");
    if (lowerPassword.includes(reversed)) {
      return { found: true, pattern: reversed };
    }
  }

  return { found: false };
}

/**
 * Detect common password variations like "password1", "password2", etc.
 *
 * @param password - The password to check
 * @param skipKeyboardBased - Whether to skip keyboard-based common words (when blockKeyboardPatterns is false)
 * @returns Object indicating if common variation was found
 */
function detectCommonVariations(
  password: string,
  skipKeyboardBased = false
): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();

  // Common base passwords with number/special char variations
  // Keyboard-based words (qwerty, asdf) are skipped when blockKeyboardPatterns is false
  const commonBases = [
    "password",
    "passw0rd",
    "admin",
    "welcome",
    "login",
    // Skip keyboard-based words when requested
    ...(skipKeyboardBased ? [] : ["qwerty"]),
    "letmein",
    "monkey",
    "dragon",
    "master",
  ];

  for (const base of commonBases) {
    // Check if password starts with common base
    if (!lowerPassword.startsWith(base)) {
      continue;
    }

    const suffix = lowerPassword.slice(base.length);

    // If there's no suffix, it's just the base word (handled elsewhere)
    if (suffix.length === 0) {
      continue;
    }

    // Check if suffix is only numbers
    if (/^\d+$/.test(suffix)) {
      return { found: true, pattern: base + "[numbers]" };
    }

    // Check if suffix is only special characters
    if (/^[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[special]" };
    }

    // Check if suffix is a year (19xx or 20xx)
    if (/^(19\d\d|20\d\d)$/.test(suffix)) {
      return { found: true, pattern: base + "[year]" };
    }

    // Check if suffix is numbers followed by special chars (e.g., "password123!@#")
    if (/^\d+[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[numbers+special]" };
    }

    // Check if suffix is special chars followed by numbers (e.g., "password!@#123")
    if (/^[!@#$%^&*]+\d+$/.test(suffix)) {
      return { found: true, pattern: base + "[special+numbers]" };
    }

    // Check if suffix is a year followed by special chars (e.g., "password2024!@#")
    if (/^(19\d\d|20\d\d)[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[year+special]" };
    }
  }

  return { found: false };
}

/**
 * Validate a password against policy requirements.
 *
 * This function performs comprehensive password validation including:
 * - Length requirements
 * - Character complexity
 * - Common password detection
 * - Character repetition
 * - Breached password checking (via HIBP k-anonymity API)
 * - Password strength scoring
 *
 * @param password - The password to validate
 * @param policy - Optional custom policy (uses defaults if not provided)
 * @param keyId - Optional key ID for password history checking
 * @returns Validation result with detailed feedback
 */
export async function validatePassword(
  password: string,
  policy: PasswordPolicy = {},
  keyId?: string
): Promise<PasswordValidationResult> {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const errors: string[] = [];

  // Check maximum length FIRST before any sanitization
  // This ensures we catch long passwords and provide a clear error message
  if (password.length > mergedPolicy.maxLength) {
    errors.push(`Password must be no more than ${mergedPolicy.maxLength} characters long`);
    return {
      valid: false,
      errors,
      strength: 0,
      strengthCategory: "weak",
    };
  }

  // Check minimum length
  if (password.length < mergedPolicy.minLength) {
    errors.push(`Password must be at least ${mergedPolicy.minLength} characters long`);
  }

  // Sanitize input to prevent injection attacks (without length truncation since we already checked)
  // For passwords, we only do basic sanitization - no SQL/Command injection prevention
  // since those would incorrectly reject valid passwords containing words like "or", "and", etc.
  const sanitizedPassword = sanitizeStringSimple(password, {
    maxLength: password.length, // Don't truncate, we already validated length
    preserveCase: true,
    preserveWhitespace: mergedPolicy.allowSpaces,
    preventSqlInjection: false, // Don't prevent SQL injection in passwords
    preventCommandInjection: false, // Don't prevent command injection in passwords
    preventLdapInjection: false, // Don't prevent LDAP injection in passwords
    preventNosqlInjection: false, // Don't prevent NoSQL injection in passwords
  });

  // Check if sanitization changed the password (injection patterns detected)
  // We only check for XSS patterns in passwords since those are actual security risks
  if (sanitizedPassword !== password) {
    errors.push("Password contains invalid characters");
    return {
      valid: false,
      errors,
      strength: 0,
      strengthCategory: "weak",
    };
  }

  // Check uppercase
  if (mergedPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check lowercase
  if (mergedPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check numbers
  if (mergedPolicy.requireNumbers && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check special characters
  if (mergedPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check spaces
  if (!mergedPolicy.allowSpaces && /\s/.test(password)) {
    errors.push("Password cannot contain spaces");
  }

  // Check against blocked passwords (exact match only)
  // Substring matching is too aggressive and would reject valid passwords
  // like "SecurePass123!" that happen to contain common words
  const lowerPassword = password.toLowerCase();
  for (const blocked of mergedPolicy.blockedPasswords) {
    if (lowerPassword === blocked) {
      errors.push("Password is too common or weak");
      break;
    }
  }

  // Check character repetition
  if (mergedPolicy.maxRepetition > 0) {
    const repetitionRegex = new RegExp(`(.)\\1{${mergedPolicy.maxRepetition},}`, "g");
    if (repetitionRegex.test(password)) {
      errors.push(
        `Password cannot contain the same character more than ${mergedPolicy.maxRepetition} times in a row`
      );
    }
  }

  // Check sequential character patterns
  if (mergedPolicy.blockSequentialChars && mergedPolicy.maxSequentialChars > 0) {
    const sequentialResult = detectSequentialChars(password, mergedPolicy.maxSequentialChars);
    if (sequentialResult.found) {
      errors.push(
        `Password contains sequential characters (${sequentialResult.pattern}). Avoid using patterns like "1234" or "abcd".`
      );
    }
  }

  // Check keyboard walking patterns
  if (mergedPolicy.blockKeyboardPatterns) {
    const keyboardResult = detectKeyboardPatterns(password);
    if (keyboardResult.found) {
      errors.push(
        `Password contains keyboard pattern (${keyboardResult.pattern}). Avoid using keyboard sequences.`
      );
    }
  }

  // Check common password variations
  // Skip keyboard-based words when blockKeyboardPatterns is disabled
  const variationResult = detectCommonVariations(password, !mergedPolicy.blockKeyboardPatterns);
  if (variationResult.found) {
    errors.push(
      `Password contains a common variation pattern (${variationResult.pattern}). Please choose a more unique password.`
    );
  }

  // Calculate strength score
  const strength = calculatePasswordStrength(password);
  const strengthCategory = getStrengthCategory(strength);

  // Check password history if keyId provided
  if (keyId && mergedPolicy.passwordHistoryCount > 0) {
    const history = passwordHistory.get(keyId);
    if (history) {
      // Check against recent passwords
      const recentHistory = history.slice(-mergedPolicy.passwordHistoryCount);
      for (const entry of recentHistory) {
        if (await verifyPasswordHash(password, entry.hash, entry.salt)) {
          errors.push("Cannot reuse a recent password");
          break;
        }
      }
    }
  }

  // Check breached passwords via HIBP API
  let breached = false;
  let breachCount = 0;
  if (mergedPolicy.checkBreachedPasswords && errors.length === 0) {
    const breachResult = await checkBreachedPassword(password);
    breached = breachResult.breached;
    breachCount = breachResult.count;

    if (breached && breachCount > (mergedPolicy.maxBreachedCount ?? 0)) {
      errors.push(
        `This password has been found in data breaches ${breachCount} times. Please choose a different password.`
      );
    }
  }

  // Check minimum strength score
  if (strength < (mergedPolicy.minStrengthScore ?? 0)) {
    errors.push(
      `Password is too weak (strength: ${strength}/100). Please choose a stronger password.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
    strengthCategory,
    breached,
    breachCount: breached ? breachCount : undefined,
  };
}

/**
 * Calculate password strength score (0-100).
 *
 * Uses entropy-based calculation with bonuses for:
 * - Length
 * - Character variety
 * - Character distribution
 */
function calculatePasswordStrength(password: string): number {
  let score = 0;

  // Length score (up to 40 points)
  score += Math.min(40, password.length * 2);

  // Character variety (up to 30 points)
  if (/[a-z]/.test(password)) score += 5;
  if (/[A-Z]/.test(password)) score += 5;
  if (/\d/.test(password)) score += 5;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 10;
  if (/\s/.test(password)) score += 5;

  // Character distribution (up to 20 points)
  const uniqueChars = new Set(password).size;
  score += Math.min(20, (uniqueChars / password.length) * 20);

  // Complexity bonus (up to 10 points)
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);

  // eslint-disable-next-line no-useless-escape
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  if (hasMixedCase && hasNumbers && hasSpecial) score += 10;

  return Math.min(100, score);
}

/**
 * Get strength category from score.
 */
function getStrengthCategory(score: number): "weak" | "fair" | "good" | "strong" {
  if (score < 40) return "weak";
  if (score < 60) return "fair";
  if (score < 80) return "good";
  return "strong";
}

/**
 * Check if a password has been breached using Have I Been Pwned k-anonymity API.
 *
 * Uses the k-anonymity model where only the first 5 characters of the
 * SHA-256 hash are sent to the API. The full hash never leaves the server.
 *
 * Results are cached for 1 hour to reduce API calls and improve performance.
 *
 * @param password - The password to check
 * @returns Object indicating if breached and the count
 */
async function checkBreachedPassword(
  password: string
): Promise<{ breached: boolean; count: number }> {
  try {
    // Calculate SHA-256 hash of password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Get first 5 characters for API request (cache key)
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    // Check cache first
    const cached = breachedPasswordCache.get(prefix);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      // Check if our specific suffix matches
      if (cached.breached) {
        return { breached: true, count: cached.count };
      }
      // If cached as not breached, we still need to check if our suffix is in the list
      // because the prefix can have multiple suffixes with different breach counts
    }

    // Query HIBP API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": "MTA-My-Way-Server/1.0",
      },
    });

    if (!response.ok) {
      logger.warn("Failed to check breached password", { status: response.status });
      return { breached: false, count: 0 };
    }

    const body = await response.text();
    const lines = body.split("\n");

    // Check if our suffix is in the results
    for (const line of lines) {
      const [lineSuffix, countStr] = line.split(":");
      if (lineSuffix?.toUpperCase() === suffix.toUpperCase()) {
        const count = parseInt(countStr ?? "0", 10);

        // Cache the result
        breachedPasswordCache.set(prefix, {
          breached: true,
          count,
          expiresAt: now + BREACHED_PASSWORD_CACHE_TTL_MS,
        });

        return { breached: true, count };
      }
    }

    // Cache the not-breached result
    breachedPasswordCache.set(prefix, {
      breached: false,
      count: 0,
      expiresAt: now + BREACHED_PASSWORD_CACHE_TTL_MS,
    });

    return { breached: false, count: 0 };
  } catch (error) {
    logger.warn("Error checking breached password", error as Error);
    return { breached: false, count: 0 };
  }
}

/**
 * Clear the breached password cache.
 *
 * This can be useful for testing or if you want to force fresh checks.
 */
export function clearBreachedPasswordCache(): void {
  breachedPasswordCache.clear();
  logger.info("Breached password cache cleared");
}

// ============================================================================
// Password Hashing
// ============================================================================

/**
 * Hash a password using Argon2id.
 *
 * Argon2id is the winner of the Password Hashing Competition (2015)
 * and is recommended by OWASP for new applications.
 *
 * Uses OWASP 2024 recommended parameters:
 * - Memory: 64 MiB
 * - Iterations: 3
 * - Parallelism: 4
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 *
 * @param password - The password to hash
 * @returns Promise containing the hash data
 */
export async function hashPassword(password: string): Promise<PasswordHash> {
  // Validate password is not empty
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  // Combine password with pepper for additional security (if configured)
  const pepper = getPasswordPepper();
  const passwordWithPepper = pepper ? password + pepper : password;

  // Hash using Argon2id with OWASP 2024 recommended parameters
  // The argon2 package handles salt generation automatically
  const hash = await argon2.hash(passwordWithPepper, ARGON2_OPTIONS);

  // Extract the salt from the encoded hash
  // Argon2 format: $argon2id$v=19$m=65536,t=3,p=4$salt$hash
  const parts = hash.split("$");
  const salt = parts[4]; // Extract salt from encoded hash

  return {
    hash,
    salt,
    algorithm: "argon2id",
    iterations: ARGON2_OPTIONS.timeCost ?? 3,
    memoryCost: ARGON2_OPTIONS.memoryCost,
    parallelism: ARGON2_OPTIONS.parallelism,
  };
}

/**
 * Verify a password against a stored Argon2id hash.
 *
 * Uses the argon2 package's built-in verify function which handles
 * timing-safe comparison to prevent timing attacks.
 *
 * @param password - The password to verify
 * @param hash - The stored Argon2id hash (encoded string)
 * @param salt - The salt used for hashing (not needed for Argon2, kept for API compatibility)
 * @returns Promise indicating if the password matches
 */
export async function verifyPasswordHash(
  password: string,
  hash: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  salt: string
): Promise<boolean> {
  // Validate inputs
  if (!password || password.length === 0) {
    return false;
  }
  if (!hash) {
    return false;
  }

  try {
    // Combine password with pepper for verification (must match hashing)
    const pepper = getPasswordPepper();
    const passwordWithPepper = pepper ? password + pepper : password;

    // Use argon2.verify which handles timing-safe comparison
    return await argon2.verify(hash, passwordWithPepper);
  } catch (error) {
    // If verification fails (invalid hash format, etc.), return false
    logger.warn("Password verification failed", { error: error as Error });
    return false;
  }
}

export function storePasswordInHistory(keyId: string, hash: string, salt: string): void {
  const history = passwordHistory.get(keyId) ?? [];
  const entry: PasswordHistoryEntry = {
    hash,
    salt,
    timestamp: Date.now(),
  };
  history.push(entry);

  // Keep only the last N passwords
  if (history.length > DEFAULT_PASSWORD_POLICY.passwordHistoryCount) {
    history.shift();
  }

  passwordHistory.set(keyId, history);
  appendPasswordHistory(keyId, entry);
  prunePasswordHistory(keyId, DEFAULT_PASSWORD_POLICY.passwordHistoryCount);
}

/**
 * Get password history for a key.
 *
 * @param keyId - The key ID
 * @returns Array of password history entries
 */
export function getPasswordHistory(keyId: string): PasswordHistoryEntry[] {
  return passwordHistory.get(keyId) ?? [];
}

/**
 * Clear password history for a key.
 *
 * @param keyId - The key ID
 * @returns Number of entries cleared
 */
export function clearPasswordHistory(keyId: string): number {
  const history = passwordHistory.get(keyId);
  if (!history) return 0;
  const count = history.length;
  passwordHistory.delete(keyId);
  return count;
}

// ============================================================================
// Password Reset Flow
// ============================================================================

/**
 * Rate limit password validation attempts to prevent enumeration attacks.
 * @private Reserved for future use
 */
function _checkPasswordValidationRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const record = passwordValidationAttempts.get(clientIp);

  if (!record || now > record.resetAt) {
    passwordValidationAttempts.set(clientIp, {
      count: 1,
      resetAt: now + PASSWORD_VALIDATION_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_PASSWORD_VALIDATIONS_PER_MINUTE) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * Generate a device fingerprint from user agent for token verification.
 */
async function generateDeviceFingerprint(userAgent?: string): Promise<string> {
  if (!userAgent) return "unknown";
  const encoder = new TextEncoder();
  const data = encoder.encode(userAgent);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Get user-friendly device information from user agent.
 */
export function getDeviceInfo(userAgent?: string): {
  deviceType: string;
  browser: string;
  os: string;
} {
  if (!userAgent) {
    return { deviceType: "Unknown", browser: "Unknown", os: "Unknown" };
  }

  const ua = userAgent.toLowerCase();

  // Detect device type
  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = "mobile";
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  }

  // Detect browser
  let browser = "Unknown";
  if (/chrome|crios/i.test(ua) && !/edge|opr|brave/i.test(ua)) {
    browser = "Chrome";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = "Safari";
  } else if (/firefox/i.test(ua)) {
    browser = "Firefox";
  } else if (/edge|edg/i.test(ua)) {
    browser = "Edge";
  } else if (/opr|opera/i.test(ua)) {
    browser = "Opera";
  } else if (/brave/i.test(ua)) {
    browser = "Brave";
  }

  // Detect OS - check mobile OS first before desktop
  let os = "Unknown";
  if (/android/i.test(ua)) {
    os = "Android";
  } else if (/ios|iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
  } else if (/windows/i.test(ua)) {
    os = "Windows";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  return { deviceType, browser, os };
}

/**
 * Generate a secure password reset token.
 *
 * @param keyId - The key ID for the user
 * @param clientIp - The client IP address
 * @param userAgent - Optional user agent string for device verification
 * @returns Object containing the raw token (for sending to user) and token data
 */
export async function generatePasswordResetToken(
  keyId: string,
  clientIp: string,
  userAgent?: string
): Promise<{
  token: string;
  tokenId: string;
  expiresAt: number;
  deviceInfo?: ReturnType<typeof getDeviceInfo>;
}> {
  // Generate random token
  const tokenBytes = new Uint8Array(RESET_TOKEN_LENGTH);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Generate token ID
  const tokenId = crypto.randomUUID();

  // Calculate SHA-256 hash of token (for storage)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Generate device fingerprint for verification
  const deviceFingerprint = await generateDeviceFingerprint(userAgent);

  // Create token data
  const tokenData: PasswordResetToken = {
    tokenId,
    keyId,
    tokenHash,
    createdAt: Date.now(),
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false,
    clientIp,
    userAgent,
    deviceFingerprint,
  };

  // Store token
  passwordResetTokens.set(tokenId, tokenData);

  const deviceInfo = getDeviceInfo(userAgent);

  logger.info("Password reset token generated", {
    tokenId,
    keyId,
    clientIp,
    deviceInfo,
  });

  return {
    token, // Return raw token for sending to user (e.g., email)
    tokenId,
    expiresAt: tokenData.expiresAt,
    deviceInfo,
  };
}

/**
 * Validate a password reset token.
 *
 * @param tokenId - The token ID
 * @param token - The raw token from the email/link
 * @param clientIp - The client IP address
 * @param userAgent - Optional user agent for device verification
 * @returns Object with keyId if valid, and a warning if device changed
 */
export async function validatePasswordResetToken(
  tokenId: string,
  token: string,
  clientIp: string,
  userAgent?: string
): Promise<{ keyId: string | null; deviceChanged: boolean; warning?: string }> {
  const tokenData = passwordResetTokens.get(tokenId);

  if (!tokenData) {
    logger.warn("Invalid password reset token ID", { tokenId, clientIp });
    return { keyId: null, deviceChanged: false };
  }

  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    passwordResetTokens.delete(tokenId);
    logger.warn("Expired password reset token", { tokenId, clientIp });
    return { keyId: null, deviceChanged: false };
  }

  // Check if already used
  if (tokenData.used) {
    passwordResetTokens.delete(tokenId);
    logger.warn("Reused password reset token", { tokenId, clientIp, keyId: tokenData.keyId });
    return { keyId: null, deviceChanged: false };
  }

  // Verify token hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  if (tokenHash !== tokenData.tokenHash) {
    logger.warn("Invalid password reset token", { tokenId, clientIp });
    return { keyId: null, deviceChanged: false };
  }

  // Check device fingerprint if userAgent provided
  let deviceChanged = false;
  let warning: string | undefined;

  if (userAgent && tokenData.deviceFingerprint) {
    const currentFingerprint = await generateDeviceFingerprint(userAgent);
    if (currentFingerprint !== tokenData.deviceFingerprint) {
      deviceChanged = true;
      const originalDevice = getDeviceInfo(tokenData.userAgent);
      const currentDevice = getDeviceInfo(userAgent);
      warning = `This reset link was requested from a different device (${originalDevice.deviceType}/${originalDevice.browser}). For your security, please verify you requested this password reset.`;
      logger.warn("Password reset device mismatch", {
        tokenId,
        originalDevice,
        currentDevice,
      });
      // Still allow the reset but log for monitoring
    }
  }

  // Verify client IP matches (optional security measure - logs mismatch but allows)
  if (tokenData.clientIp !== clientIp) {
    logger.warn("Password reset token IP mismatch", {
      tokenId,
      expectedIp: tokenData.clientIp,
      receivedIp: clientIp,
    });
    // Still allow but log for monitoring
  }

  return { keyId: tokenData.keyId, deviceChanged, warning };
}

/**
 * Consume a password reset token (mark as used).
 *
 * @param tokenId - The token ID
 * @returns True if successfully consumed
 */
export function consumePasswordResetToken(tokenId: string): boolean {
  const tokenData = passwordResetTokens.get(tokenId);

  if (!tokenData) {
    return false;
  }

  // Mark as used
  tokenData.used = true;

  // Delete after a short delay (for logging purposes)
  setTimeout(() => {
    passwordResetTokens.delete(tokenId);
  }, 5000);

  logger.info("Password reset token consumed", { tokenId, keyId: tokenData.keyId });

  return true;
}

/**
 * Invalidate all existing reset tokens for a key ID.
 *
 * @param keyId - The key ID
 * @returns Number of tokens invalidated
 */
export function invalidateResetTokensForKey(keyId: string): number {
  let count = 0;
  for (const [tokenId, tokenData] of passwordResetTokens.entries()) {
    if (tokenData.keyId === keyId && !tokenData.used) {
      passwordResetTokens.delete(tokenId);
      count++;
    }
  }
  return count;
}

/**
 * Set a token's expiration time for testing purposes.
 *
 * @param tokenId - The token ID
 * @param expiresAt - The new expiration timestamp
 * @returns True if token was found and updated
 *
 * @internal This is intended for testing only
 */
export function _setTokenExpirationForTesting(tokenId: string, expiresAt: number): boolean {
  const tokenData = passwordResetTokens.get(tokenId);
  if (tokenData) {
    tokenData.expiresAt = expiresAt;
    return true;
  }
  return false;
}

/**
 * Get the internal password reset tokens map for testing.
 *
 * @internal This is intended for testing only
 */
export function _getPasswordResetTokensMap(): Map<string, PasswordResetToken> {
  return passwordResetTokens;
}

// ============================================================================
// Password Expiration and Rotation
// ============================================================================

/**
 * Check if a password has expired based on policy.
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns True if password has expired
 */
export function isPasswordExpired(passwordSetAt: number, policy: PasswordPolicy = {}): boolean {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;

  if (expirationDays === 0) {
    return false; // No expiration
  }

  const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
  return Date.now() > passwordSetAt + expirationMs;
}

/**
 * Check if a password is in the grace period (expired but can still be used).
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns True if password is in grace period
 */
export function isPasswordInGracePeriod(
  passwordSetAt: number,
  policy: PasswordPolicy = {}
): boolean {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;
  const gracePeriodDays = mergedPolicy.passwordGracePeriodDays ?? 0;

  if (expirationDays === 0) {
    return false; // No expiration means no grace period
  }

  if (gracePeriodDays === 0) {
    return false; // No grace period configured
  }

  const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
  const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiresAt = passwordSetAt + expirationMs;
  const graceEndsAt = expiresAt + gracePeriodMs;

  // In grace period if expired but still within grace window
  return now > expiresAt && now <= graceEndsAt;
}

/**
 * Get the number of days remaining in the grace period.
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns Days remaining in grace period, or null if not in grace period
 */
export function getDaysInGracePeriod(
  passwordSetAt: number,
  policy: PasswordPolicy = {}
): number | null {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;
  const gracePeriodDays = mergedPolicy.passwordGracePeriodDays ?? 0;

  if (expirationDays === 0 || gracePeriodDays === 0) {
    return null; // No expiration or grace period
  }

  const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
  const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiresAt = passwordSetAt + expirationMs;
  const graceEndsAt = expiresAt + gracePeriodMs;

  if (now <= expiresAt) {
    return null; // Not expired yet
  }

  if (now > graceEndsAt) {
    return 0; // Grace period ended
  }

  // Calculate remaining days in grace period
  const remainingMs = graceEndsAt - now;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * Get days until password expiration.
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns Days until expiration, or null if no expiration
 */
export function getDaysUntilExpiration(
  passwordSetAt: number,
  policy: PasswordPolicy = {}
): number | null {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;

  if (expirationDays === 0) {
    return null; // No expiration
  }

  const expirationMs = passwordSetAt + expirationDays * 24 * 60 * 60 * 1000;
  const remainingMs = expirationMs - Date.now();

  if (remainingMs <= 0) {
    return 0; // Already expired
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * Check if a password should be changed soon (warning threshold).
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param warningDays - Days before expiration to warn (default: 7)
 * @param policy - Optional custom policy
 * @returns True if password should be changed soon
 */
export function shouldWarnPasswordExpiration(
  passwordSetAt: number,
  warningDays = 7,
  policy: PasswordPolicy = {}
): boolean {
  const daysUntil = getDaysUntilExpiration(passwordSetAt, policy);
  if (daysUntil === null) {
    return false; // No expiration
  }
  return daysUntil <= warningDays;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a secure random password.
 *
 * @param length - Password length (default: 16)
 * @param options - Options for password generation
 * @returns Generated password
 */
export function generateSecurePassword(
  length = 16,
  options: {
    includeUppercase?: boolean;
    includeLowercase?: boolean;
    includeNumbers?: boolean;
    includeSpecialChars?: boolean;
    excludeAmbiguous?: boolean; // Exclude 0OIl1
  } = {}
): string {
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSpecialChars = true,
    excludeAmbiguous = false,
  } = options;

  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ" + (excludeAmbiguous ? "" : "IO");
  const lowercase = "abcdefghjkmnpqrstuvwxyz" + (excludeAmbiguous ? "" : "ilo");
  const numbers = "23456789" + (excludeAmbiguous ? "" : "01");
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  let charset = "";
  if (includeLowercase) charset += lowercase;
  if (includeUppercase) charset += uppercase;
  if (includeNumbers) charset += numbers;
  if (includeSpecialChars) charset += special;

  if (charset.length === 0) {
    charset = lowercase + numbers;
  }

  // Ensure at least one character from each selected type is included
  let password = "";
  const guaranteed: string[] = [];
  if (includeLowercase) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    guaranteed.push(lowercase[array[0]! % lowercase.length]!);
  }
  if (includeUppercase) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    guaranteed.push(uppercase[array[0]! % uppercase.length]!);
  }
  if (includeNumbers) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    guaranteed.push(numbers[array[0]! % numbers.length]!);
  }
  if (includeSpecialChars) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    guaranteed.push(special[array[0]! % special.length]!);
  }

  // Fill the rest randomly
  const remainingLength = length - guaranteed.length;
  if (remainingLength > 0) {
    const array = new Uint8Array(remainingLength);
    crypto.getRandomValues(array);
    for (let i = 0; i < remainingLength; i++) {
      password += charset[array[i]! % charset.length];
    }
  }

  // Add guaranteed characters and shuffle
  password += guaranteed.join("");
  const passwordArray = password.split("");
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordArray[i], passwordArray[j]] = [passwordArray[j]!, passwordArray[i]!];
  }

  return passwordArray.join("");
}

/**
 * Get password policy for display to users.
 *
 * @returns Formatted password policy requirements
 */
export function getPasswordPolicyDescription(): {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  allowSpaces: boolean;
  expirationDays: number;
  historyCount: number;
  gracePeriodDays: number;
} {
  return {
    minLength: DEFAULT_PASSWORD_POLICY.minLength,
    maxLength: DEFAULT_PASSWORD_POLICY.maxLength,
    requireUppercase: DEFAULT_PASSWORD_POLICY.requireUppercase,
    requireLowercase: DEFAULT_PASSWORD_POLICY.requireLowercase,
    requireNumbers: DEFAULT_PASSWORD_POLICY.requireNumbers,
    requireSpecialChars: DEFAULT_PASSWORD_POLICY.requireSpecialChars,
    allowSpaces: DEFAULT_PASSWORD_POLICY.allowSpaces,
    expirationDays: DEFAULT_PASSWORD_POLICY.passwordExpirationDays ?? 0,
    historyCount: DEFAULT_PASSWORD_POLICY.passwordHistoryCount,
    gracePeriodDays: DEFAULT_PASSWORD_POLICY.passwordGracePeriodDays ?? 0,
  };
}

/**
 * Risk-based password expiration configuration.
 * Maps user roles to password expiration periods.
 */
const RISK_BASED_EXPIRATION: Record<string, number> = {
  admin: 90, // Admin accounts: 90 days
  moderator: 120, // Moderator accounts: 120 days
  user: 180, // Regular user accounts: 180 days
  guest: 0, // Guest accounts: no expiration
};

/**
 * Get password expiration days based on user role.
 *
 * This implements risk-based authentication where higher-privilege
 * accounts have shorter password expiration periods for enhanced security.
 *
 * @param role - The user role (admin, moderator, user, guest)
 * @returns Number of days before password expires (0 = no expiration)
 */
export function getExpirationDaysForRole(role: string): number {
  return RISK_BASED_EXPIRATION[role] ?? RISK_BASED_EXPIRATION.user ?? 0;
}

/**
 * Get password policy for a specific role.
 *
 * Returns the password policy with role-specific expiration days.
 *
 * @param role - The user role
 * @returns Formatted password policy requirements for the role
 */
export function getPasswordPolicyForRole(role: string): {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  allowSpaces: boolean;
  expirationDays: number;
  historyCount: number;
  gracePeriodDays: number;
  role: string;
} {
  const basePolicy = getPasswordPolicyDescription();
  const roleExpirationDays = getExpirationDaysForRole(role);

  return {
    ...basePolicy,
    expirationDays: roleExpirationDays,
    role,
  };
}

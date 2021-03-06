import * as chai from 'chai'
import * as sdk from "../src/sdk";
import * as util from "../src/util";
import * as crypto from "crypto";

import * as ecies from "@ieigen/ecies-js";
import * as elliptic from "elliptic"
const EC = elliptic.ec;
const ec = new EC("p256");

util.require_env_variables([
  "TEESDK_AUDITOR_BASE_DIR",
  "TEESDK_AUDITOR_NAME",
  "TEESDK_ENCLAVE_INFO_PATH",
  "RELAY_ADDRESS",
  "RELAY_PORT"
]);

const AUDITOR_BASE_DIR = process.env.TEESDK_AUDITOR_BASE_DIR;
// auditor_name, e.g., "godzilla"
const AUDITOR_NAME = process.env.TEESDK_AUDITOR_NAME;
const ENCLAVE_INFO_PATH = process.env.TEESDK_ENCLAVE_INFO_PATH;
const PUB = `${AUDITOR_BASE_DIR}/${AUDITOR_NAME}/${AUDITOR_NAME}.public.der`;
const SIG = `${AUDITOR_BASE_DIR}/${AUDITOR_NAME}/${AUDITOR_NAME}.sign.sha256`;
const ROOTCA = `deps/ias_root_ca_cert.pem`;

describe("basic sdk", async() => {
    it("Basic test", async() => {
        const client = new sdk.EigenRelayClient(
            "fns",
            PUB,
            SIG,
            ROOTCA,
            ENCLAVE_INFO_PATH,
            process.env.RELAY_ADDRESS,
            Number(process.env.RELAY_PORT)
        );
        client.submit_task("EigenTEERegister", "", async (relayPubKey) => {
            if (relayPubKey.length === 0) {
                throw new Error("Get public key failed")
            }

            const options = {
                hashName: 'sha512',
                hashLength: 64,
                macName: 'sha256',
                macLength: 32,
                curveName: 'prime256v1',
                symmetricCypherName: 'aes-256-gcm',
                keyFormat: 'uncompressed',
                s1: null, // optional shared information1
                s2: null // optional shared information2
            }
            const keyPair = ec.keyFromPublic(relayPubKey, "hex");
            const publicKey = keyPair.getPublic();

            // generate c1
            const rawPrivateKey = crypto.randomBytes(32)
            let privateKey = rawPrivateKey.toString("base64");
            const c1 = ecies.encrypt(publicKey, privateKey, options).toString("hex");
            console.log("c1", c1)

            // generate cc1
            const password = crypto.randomBytes(16).toString("base64");
            // console.log("Password", password)
            const cc1 = ecies.encrypt(publicKey, password, options).toString("hex");

            // encrypt by kms
            let encryptMsg = `encrypt|${c1}|${cc1}|`
            console.log(encryptMsg)
            client.submit_task("relay", encryptMsg, async(c2) => {
                // console.log(c2)
                // decrypt
                const aesKey = "12345678901234567890123456789012"//crypto.randomBytes(32)
                // console.log(aesKey)
                const cr1 = ecies.encrypt(publicKey, aesKey, options).toString("hex")
                const cc2 = c2.toString("hex")

                encryptMsg = `decrypt|${cc2}|${cc1}|${cr1}`
                console.log("cc2, cc1, cr1", encryptMsg)
                client.submit_task("relay", encryptMsg, async (decryptedPrivateKey) => {
                    const privateKey2 = ecies.aes_dec('aes-256-gcm', aesKey, Buffer.from(decryptedPrivateKey, "base64"))
                    console.log("msg", privateKey2, privateKey, Buffer.from(privateKey2, "base64").toString("hex"), rawPrivateKey.toString("hex"))
                    chai.expect(privateKey).to.eq(privateKey2)
                    // console.log("Done")
                })
            })
        })
    })
})

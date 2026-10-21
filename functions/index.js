const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

// Set these once with:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   firebase functions:secrets:set TWILIO_FROM_NUMBER
// See SETUP.md for the full walkthrough.
const twilioSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioFrom = defineSecret("TWILIO_FROM_NUMBER");

function genTempPassword(){
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  var out = "";
  for (var i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Shared by every "an Admin or Supervisor acts on another user" function below.
// An Admin may act on anyone (except themself, checked by each caller). A Supervisor
// may only act on a Contractor or Supervisor who is an actual member of THIS project,
// and never on an Admin. Nothing here trusts anything the client claims about its own role.
async function checkCanManageTarget(db, callerUid, targetUid, projectId){
  var callerAdminDoc = await db.collection("admins").doc(callerUid).get();
  if (callerAdminDoc.exists) return true;

  var memberDoc = await db.collection("members").doc(projectId + "_" + callerUid).get();
  var callerIsSupervisor = memberDoc.exists && memberDoc.data().role === "Supervisor";
  if (!callerIsSupervisor) return false;

  var targetAdminDoc = await db.collection("admins").doc(targetUid).get();
  var targetMemberDoc = await db.collection("members").doc(projectId + "_" + targetUid).get();
  return !targetAdminDoc.exists && targetMemberDoc.exists;
}

function requireTargetArgs(request){
  var data = request.data || {};
  var targetUid = data.targetUid;
  var projectId = data.projectId;
  if (!request.auth){
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (!targetUid || projectId === undefined || projectId === null){
    throw new HttpsError("invalid-argument", "Missing targetUid or projectId.");
  }
  if (targetUid === request.auth.uid){
    throw new HttpsError("failed-precondition", "This isn't available for your own account.");
  }
  return { callerUid: request.auth.uid, targetUid: targetUid, projectId: projectId };
}

// Callable from the client as: firebase.functions().httpsCallable("resetUserPassword")({ targetUid, projectId })
// Returns { tempPassword, smsSent, phone }.
exports.resetUserPassword = onCall({ secrets: [twilioSid, twilioToken, twilioFrom] }, async (request) => {
  var args = requireTargetArgs(request);
  var db = admin.firestore();
  var allowed = await checkCanManageTarget(db, args.callerUid, args.targetUid, args.projectId);
  if (!allowed){
    throw new HttpsError("permission-denied", "You can't reset this user's password.");
  }

  var tempPassword = genTempPassword();
  await admin.auth().updateUser(args.targetUid, { password: tempPassword });
  await db.collection("mustChangePassword").doc(args.targetUid).set({
    setAt: Date.now(),
    setBy: args.callerUid
  });

  var smsSent = false;
  var userDoc = await db.collection("users").doc(args.targetUid).get();
  var phone = userDoc.exists ? (userDoc.data().phone || null) : null;

  if (phone){
    try {
      var client = twilio(twilioSid.value(), twilioToken.value());
      await client.messages.create({
        body: "Trackline: your password was reset. Temporary password: " + tempPassword +
          ". You'll be asked to set a new one when you sign in.",
        from: twilioFrom.value(),
        to: phone
      });
      smsSent = true;
    } catch (e){
      console.error("SMS send failed:", e);
      // Fall through — the caller still gets the temp password back to relay manually.
    }
  }

  return { tempPassword: tempPassword, smsSent: smsSent, phone: phone };
});

// Callable from the client as: firebase.functions().httpsCallable("setAccountDisabled")({ targetUid, projectId, disabled })
// Disables or re-enables sign-in for the target account, and forces out any session
// they currently have open (revokeRefreshTokens). Mirrors the state into
// /disabledAccounts/{uid} so clients can see and react to it without needing
// Auth-admin access themselves.
exports.setAccountDisabled = onCall({}, async (request) => {
  var args = requireTargetArgs(request);
  var disabled = !!(request.data && request.data.disabled);
  var db = admin.firestore();
  var allowed = await checkCanManageTarget(db, args.callerUid, args.targetUid, args.projectId);
  if (!allowed){
    throw new HttpsError("permission-denied", "You can't change this user's account status.");
  }

  await admin.auth().updateUser(args.targetUid, { disabled: disabled });

  if (disabled){
    await admin.auth().revokeRefreshTokens(args.targetUid);
    await db.collection("disabledAccounts").doc(args.targetUid).set({
      disabledAt: Date.now(),
      disabledBy: args.callerUid
    });
  } else {
    await db.collection("disabledAccounts").doc(args.targetUid).delete();
  }

  return { disabled: disabled };
});

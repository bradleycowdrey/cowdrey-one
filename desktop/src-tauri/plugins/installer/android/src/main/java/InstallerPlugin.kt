// Cowdrey One's installer on Android.
// - installedVersions: which of Bradley Cowdrey's apps are installed, with their versions.
// - canInstall / openInstallSettings: Android's "Install unknown apps" permission for Cowdrey One.
// - openApp: opens one of them.
// - install: downloads an app's APK from its GitHub release and hands it to Android's package installer, which asks
//   "Install?" once. Apps Cowdrey One installed update without asking on Android 12 and later.
package com.bradcowdrey.installer

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@InvokeArg
class PackagesArgs {
    var packages: Array<String> = arrayOf()
}

@InvokeArg
class InstallArgs {
    lateinit var url: String
    lateinit var name: String
    var packageName: String? = null
}

@InvokeArg
class OpenArgs {
    lateinit var packageName: String
}

@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun installedVersions(invoke: Invoke) {
        val args = invoke.parseArgs(PackagesArgs::class.java)
        val pm = activity.packageManager
        val apps = JSObject()
        for (p in args.packages) {
            try {
                val info = pm.getPackageInfo(p, 0)
                apps.put(p, JSObject().apply {
                    put("version", info.versionName ?: "")
                    put("installer", installerOf(pm, p) ?: "")
                })
            } catch (_: PackageManager.NameNotFoundException) {
                // not installed
            }
        }
        invoke.resolve(JSObject().apply { put("apps", apps) })
    }

    private fun installerOf(pm: PackageManager, p: String): String? = try {
        if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(p).installingPackageName
        else @Suppress("DEPRECATION") pm.getInstallerPackageName(p)
    } catch (_: Exception) {
        null
    }

    @Command
    fun openApp(invoke: Invoke) {
        val args = invoke.parseArgs(OpenArgs::class.java)
        val launch = if (args.packageName.startsWith("com.bradcowdrey.")) activity.packageManager.getLaunchIntentForPackage(args.packageName) else null
        if (launch == null) {
            invoke.reject("That app isn't installed")
            return
        }
        activity.startActivity(launch)
        invoke.resolve()
    }

    @Command
    fun canInstall(invoke: Invoke) {
        val allowed = Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()
        invoke.resolve(JSObject().apply { put("allowed", allowed) })
    }

    @Command
    fun openInstallSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 26) {
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName))
            )
        }
        invoke.resolve()
    }

    @Command
    fun install(invoke: Invoke) {
        val args = invoke.parseArgs(InstallArgs::class.java)
        // Only Bradley Cowdrey's own releases, never an address from anywhere else.
        if (!args.url.startsWith("https://github.com/bradleycowdrey/")) {
            invoke.reject("That download isn't one of Bradley Cowdrey's apps")
            return
        }
        Thread {
            try {
                val dir = File(activity.cacheDir, "installs").apply { mkdirs() }
                val apk = File(dir, args.name.replace(Regex("[^A-Za-z0-9._-]"), "") + ".apk")
                download(args.url, apk)
                commit(apk, args, invoke)
            } catch (e: Exception) {
                invoke.reject("Couldn't install ${args.name}: ${e.message ?: e.toString()}")
            }
        }.start()
    }

    /** GitHub answers a release download with a redirect to its file host; both are https, so it is followed. */
    private fun download(url: String, to: File) {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 20000
        c.readTimeout = 60000
        try {
            val code = c.responseCode
            if (code != 200) throw Exception("the download failed (HTTP $code)")
            c.inputStream.use { input -> to.outputStream().use { output -> input.copyTo(output) } }
        } finally {
            c.disconnect()
        }
    }

    private fun commit(apk: File, args: InstallArgs, invoke: Invoke) {
        val installer = activity.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        args.packageName?.let { params.setAppPackageName(it) }
        if (Build.VERSION.SDK_INT >= 31) {
            // Updates to apps Cowdrey One installed go ahead without asking; a first install always asks.
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        val session = installer.openSession(sessionId)
        try {
            apk.inputStream().use { input ->
                session.openWrite("base.apk", 0, apk.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }
            val action = "${activity.packageName}.INSTALL_RESULT.$sessionId"
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
                    when (status) {
                        PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                            // Android's own "Install?" screen.
                            val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) {
                                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(Intent.EXTRA_INTENT)
                            }
                            if (confirm == null) {
                                finish()
                                invoke.reject("Android didn't ask to install ${args.name}")
                            } else {
                                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                activity.startActivity(confirm)
                            }
                        }
                        PackageInstaller.STATUS_SUCCESS -> {
                            finish()
                            invoke.resolve(JSObject().apply { put("status", "installed") })
                        }
                        PackageInstaller.STATUS_FAILURE_ABORTED -> {
                            finish()
                            invoke.resolve(JSObject().apply { put("status", "cancelled") })
                        }
                        else -> {
                            finish()
                            val why = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                            invoke.reject(
                                if (status == PackageInstaller.STATUS_FAILURE_CONFLICT)
                                    "${args.name} is already installed from somewhere else with a different signature. Uninstall it, then try again."
                                else "Android couldn't install ${args.name}" + (if (why != null) ": $why" else "")
                            )
                        }
                    }
                }

                fun finish() {
                    try {
                        activity.unregisterReceiver(this)
                    } catch (_: Exception) {
                    }
                    apk.delete()
                }
            }
            ContextCompat.registerReceiver(activity, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(activity, sessionId, Intent(action).setPackage(activity.packageName), flags)
            session.commit(pending.intentSender)
        } catch (e: Exception) {
            session.abandon()
            throw e
        } finally {
            session.close()
        }
    }
}

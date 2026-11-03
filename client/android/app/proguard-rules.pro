# SpaceFighter Android release rules.
# Keep actionable line information for Play/Crashlytics stack traces while allowing R8 to optimize code.
-keepattributes SourceFile,LineNumberTable,RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor discovers plugins and JavaScript bridges through annotations/reflection.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.getcapacitor.** { *; }
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Native plugins used by this application. Keep their reflected entry points stable.
-keep class com.capgo.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class com.revenuecat.purchases.** { *; }
-keep class com.google.android.gms.ads.** { *; }

# Preserve enum helpers and Parcelable creators used across plugin boundaries.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

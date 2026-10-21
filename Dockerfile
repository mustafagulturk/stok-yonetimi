# 1) React arayüzünü derle
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build --outDir /out/wwwroot --emptyOutDir

# 2) API'yi derle
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY backend/src/StokYonetimi.Api/StokYonetimi.Api.csproj backend/src/StokYonetimi.Api/
RUN dotnet restore backend/src/StokYonetimi.Api/StokYonetimi.Api.csproj
COPY backend/src/ backend/src/
RUN dotnet publish backend/src/StokYonetimi.Api -c Release -o /out/app --no-restore

# 3) Tek imaj: API + statik arayüz
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=api /out/app ./
COPY --from=web /out/wwwroot ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080 \
    TZ=Europe/Istanbul
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "StokYonetimi.Api.dll"]
